import {
  CommandError,
  cleanFeedback,
  type FeedbackReport,
} from '@seo/core/commands'
import { SEO_VERSION } from '@seo/core/hosted'
import { linkOf } from './cli.ts'
import { userAgentOf } from './signup.ts'
import { accountsOf } from './store.ts'

// seo_feedback: a bug or idea about SEO Skill from an agent, forwarded to
// the maintainer's Amp webhook (FEEDBACK_WEBHOOK_URL), which posts it into
// a thread for review. Nothing is kept here except today's count per
// sender, hashed (migrations/0022). The hosted MCP sends the account's
// email; the CLI and the local MCP post to /mcp/feedback, with the
// account's email when the machine is linked and anonymously otherwise.

// Reports a day from one account or IP address, and from everyone.
const PER_SENDER = 10
const PER_DAY = 100
const BODY_MAX = 16_000

type Sender = { account: { id: string; email: string | null } | null }

const day = () => new Date().toISOString().slice(0, 10)

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Counts one report for the sender and for the day, and refuses one over
// either cap.
async function count(env: Env, sender: string): Promise<void> {
  const today = day()
  const key = await hash(`${sender}:${today}`)
  const add = (who: string) =>
    env.DB.prepare(
      `INSERT INTO feedback_counts (day, sender, n) VALUES (?1, ?2, 1)
       ON CONFLICT (day, sender) DO UPDATE SET n = n + 1 RETURNING n`,
    ).bind(today, who)
  const [mine, all] = await env.DB.batch<{ n: number }>([
    add(key),
    add('*'),
    env.DB.prepare('DELETE FROM feedback_counts WHERE day < ?1').bind(today),
  ])
  if (
    (mine?.results[0]?.n ?? 0) > PER_SENDER ||
    (all?.results[0]?.n ?? 0) > PER_DAY
  ) {
    throw new CommandError(
      'RATE_LIMITED',
      'Too much feedback today. Try again tomorrow, or open an issue at https://github.com/iannuttall/seo/issues.',
    )
  }
}

async function emailOf(env: Env, userId: string): Promise<string | null> {
  const first = (await accountsOf(env, userId)).find(
    (account) => account.provider === 'google',
  )
  return first?.label.includes('@') ? first.label : null
}

async function forward(
  env: Env,
  report: FeedbackReport,
  from: Sender & {
    surface: 'hosted' | 'cli'
    client: string | null
    version: string
  },
): Promise<void> {
  if (!env.FEEDBACK_WEBHOOK_URL) {
    throw new CommandError(
      'PROVIDER_ERROR',
      'Feedback is not set up on this server. Open an issue at https://github.com/iannuttall/seo/issues instead.',
    )
  }
  const id = crypto.randomUUID()
  const response = await fetch(env.FEEDBACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': id },
    body: JSON.stringify({
      type: 'seo_feedback',
      id,
      sent_at: new Date().toISOString(),
      ...report,
      surface: from.surface,
      client: from.client,
      version: from.version,
      account: from.account,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!response?.ok) {
    throw new CommandError(
      'PROVIDER_ERROR',
      'The feedback could not be sent. Try again in a minute.',
    )
  }
}

// From the hosted MCP's seo_feedback.
export async function hostedFeedback(
  env: Env,
  userId: string,
  userAgent: string | null,
  report: FeedbackReport,
): Promise<void> {
  await count(env, `u:${userId}`)
  await forward(env, cleanFeedback(report), {
    surface: 'hosted',
    client: userAgent?.slice(0, 200) ?? null,
    version: SEO_VERSION,
    account: { id: userId, email: await emailOf(env, userId) },
  })
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

// POST /mcp/feedback from the CLI and the local MCP.
export async function cliFeedback(
  request: Request,
  env: Env,
): Promise<Response> {
  const text = await request.text()
  if (text.length > BODY_MAX) {
    return json({ error: 'invalid_input', message: 'Too long.' }, 400)
  }
  let body: Record<string, unknown>
  let report: FeedbackReport
  try {
    body = JSON.parse(text)
    report = cleanFeedback(body)
  } catch (thrown) {
    return json(
      {
        error: 'invalid_input',
        message:
          thrown instanceof CommandError ? thrown.message : 'Not valid JSON.',
      },
      400,
    )
  }
  const link = await linkOf(request, env)
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const userAgent = userAgentOf(request)
  const agent =
    typeof body.agent === 'string' && /^[\w.-]{1,40}$/.test(body.agent)
      ? body.agent
      : null
  try {
    await count(env, link ? `u:${link.userId}` : `ip:${ip}`)
    await forward(env, report, {
      surface: 'cli',
      client: agent,
      version: userAgent?.match(/^seo\/([\w.+-]{1,40})/)?.[1] ?? 'unknown',
      account: link
        ? { id: link.userId, email: await emailOf(env, link.userId) }
        : null,
    })
  } catch (thrown) {
    if (thrown instanceof CommandError && thrown.code === 'RATE_LIMITED') {
      return json({ error: 'rate_limited', message: thrown.message }, 429)
    }
    throw thrown
  }
  return json({ sent: true })
}
