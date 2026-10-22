import { readJsonOrUndefined } from '@seo/core/hosted'
import { betaFlags } from '../beta.ts'
import { seal } from '../seal.ts'
import { accountsOf } from '../store.ts'
import {
  ALERTS,
  type AlertData,
  type AlertTypeId,
  isAlertType,
} from './registry.ts'
import { alertSettings, recordWebhook, webhookUrlProblem } from './settings.ts'

// Queues an alert and sends it: one email to the account holder and one
// signed webhook call, each only when the person has it on. Delivery is
// tried at once; the hourly cron retries what failed (sendDueAlerts).
//
// Email goes through PostShiba's HTTP API on the transactional cluster. An
// Idempotency-Key per alert makes a retry after a timeout safe. The cluster
// sends at most 600 a day, so alert email stops at EMAIL_PER_DAY a UTC day;
// the rest is held for the next day and says so when it goes.
// Without POSTSHIBA_API_KEY, email is skipped.

const POSTSHIBA = 'https://app.postshiba.com/api/v1'
const EMAIL_PER_DAY = 550
const EMAIL_ATTEMPTS = 5
const WEBHOOK_ATTEMPTS = 6
const TIMEOUT_MS = 10_000
const DUE_PER_TICK = 50
const KEEP_MS = 30 * 86_400_000
const MINUTE = 60_000

type State = 'pending' | 'sent' | 'off' | 'held' | 'failed'

type Row = {
  id: string
  user_id: string
  type: string
  site: string
  created_at: number
  data: string
  email: State
  email_attempts: number
  held_on: string | null
  webhook: State
  webhook_attempts: number
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const nextUtcDay = (ms: number) =>
  Date.parse(`${utcDay(ms)}T00:00:00Z`) + 86_400_000 + 5 * MINUTE
const backoff = (attempts: number) =>
  Math.min(6 * 60 * MINUTE, 5 * MINUTE * 2 ** attempts)

// The account holder: the first Google account linked.
async function recipient(env: Env, userId: string): Promise<string | null> {
  const first = (await accountsOf(env, userId)).find(
    (account) => account.provider === 'google',
  )
  return first?.label.includes('@') ? first.label : null
}

// Queues one alert of a type for one site and tries to send it. Returns
// the alert id, or null when the account gets nothing for it (not in the
// type's beta, or both channels off).
export async function queueAlert<T extends AlertTypeId>(
  env: Env,
  input: { userId: string; type: T; site: string; data: AlertData[T] },
  now = Date.now(),
): Promise<string | null> {
  const type = ALERTS[input.type]
  if (!(await betaFlags(env, input.userId)).has(type.flag)) return null
  const settings = await alertSettings(env, input.userId)
  const wants = settings.types.find((item) => item.id === input.type)
  const email: State = wants?.email ? 'pending' : 'off'
  const webhook: State =
    wants?.webhook && settings.webhookUrl ? 'pending' : 'off'
  if (email === 'off' && webhook === 'off') return null
  const id = `alt_${crypto.randomUUID().replaceAll('-', '')}`
  await env.DB.prepare(
    `INSERT INTO alerts (id, user_id, type, site, created_at, data, email, webhook, next_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.userId,
      input.type,
      input.site,
      now,
      JSON.stringify(input.data),
      email,
      webhook,
      now,
    )
    .run()
  await deliver(env, id, now).catch(() => null)
  return id
}

// Alerts due a try, oldest first, and alerts past 30 days removed.
export async function sendDueAlerts(env: Env, now = Date.now()) {
  const due = await env.DB.prepare(
    'SELECT id FROM alerts WHERE next_at <= ? ORDER BY next_at, id LIMIT ?',
  )
    .bind(now, DUE_PER_TICK)
    .all<{ id: string }>()
  for (const row of due.results) {
    await deliver(env, row.id, now).catch(() => null)
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM alerts WHERE created_at < ?').bind(
      now - KEEP_MS,
    ),
    env.DB.prepare('DELETE FROM alert_email_days WHERE day < ?').bind(
      utcDay(now - KEEP_MS),
    ),
  ])
}

async function deliver(env: Env, id: string, now: number): Promise<void> {
  const row = await env.DB.prepare('SELECT * FROM alerts WHERE id = ?')
    .bind(id)
    .first<Row>()
  if (!row || !isAlertType(row.type)) return
  const email =
    row.email === 'pending' || row.email === 'held'
      ? await sendEmail(env, row, now)
      : { state: row.email }
  const webhook =
    row.webhook === 'pending'
      ? await sendWebhook(env, row, now)
      : { state: row.webhook }
  const retries = [email, webhook]
    .map((item) => ('retryAt' in item ? item.retryAt : undefined))
    .filter((at): at is number => at !== undefined)
  await env.DB.prepare(
    `UPDATE alerts SET email = ?, email_attempts = ?, email_error = coalesce(?, email_error),
       held_on = coalesce(?, held_on), webhook = ?, webhook_attempts = ?,
       webhook_error = coalesce(?, webhook_error), next_at = ?
     WHERE id = ?`,
  )
    .bind(
      email.state,
      row.email_attempts + ('tried' in email && email.tried ? 1 : 0),
      'error' in email ? (email.error ?? null) : null,
      'heldOn' in email ? (email.heldOn ?? null) : null,
      webhook.state,
      row.webhook_attempts + ('tried' in webhook && webhook.tried ? 1 : 0),
      'error' in webhook ? (webhook.error ?? null) : null,
      retries.length ? Math.min(...retries) : null,
      id,
    )
    .run()
}

type Outcome = {
  state: State
  tried?: boolean
  error?: string
  retryAt?: number
  heldOn?: string
}

async function sendEmail(env: Env, row: Row, now: number): Promise<Outcome> {
  if (!env.POSTSHIBA_API_KEY) {
    return { state: 'off', error: 'Email is not set up on this server.' }
  }
  const to = await recipient(env, row.user_id)
  if (!to) return { state: 'off', error: 'The account has no email address.' }
  const day = utcDay(now)
  // A place in today's allowance, or held for tomorrow.
  const place = await env.DB.prepare(
    `INSERT INTO alert_email_days (day, sent) VALUES (?, 1)
     ON CONFLICT (day) DO UPDATE SET sent = sent + 1 WHERE sent < ?
     RETURNING sent`,
  )
    .bind(day, EMAIL_PER_DAY)
    .first<{ sent: number }>()
  if (!place) {
    if (row.held_on !== day) {
      await env.DB.prepare(
        'UPDATE alert_email_days SET held = held + 1 WHERE day = ?',
      )
        .bind(day)
        .run()
    }
    return {
      state: 'held',
      heldOn: row.held_on ?? day,
      retryAt: nextUtcDay(now),
    }
  }
  const type = row.type as AlertTypeId
  const message = ALERTS[type].email(JSON.parse(row.data), row.site)
  const off = `${env.PUBLIC_URL}/account/alerts/off?t=${await seal(
    env.SEAL_KEY,
    { k: 'alert-off', userId: row.user_id, type },
  )}`
  const text = [
    message.text,
    ...(row.held_on
      ? [
          '',
          `This alert was held back on ${row.held_on} by the daily email limit.`,
        ]
      : []),
    '',
    '--',
    `SEO Skill sends this because ${ALERTS[type].title.toLowerCase()} alerts are on for your account.`,
    `Turn these emails off: ${off}`,
    `Change alerts: ${env.PUBLIC_URL}/account#alerts`,
  ].join('\n')
  const tried = { tried: true }
  let response: Response
  try {
    response = await fetch(
      `${POSTSHIBA}/teams/${env.POSTSHIBA_TEAM}/clusters/${env.POSTSHIBA_CLUSTER}/sends`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.POSTSHIBA_API_KEY}`,
          'content-type': 'application/json',
          'idempotency-key': row.id,
        },
        body: JSON.stringify({
          from: env.ALERT_FROM,
          to: [to],
          ...(env.ALERT_REPLY_TO ? { reply_to: env.ALERT_REPLY_TO } : {}),
          subject: message.subject,
          text,
          headers: {
            'List-Unsubscribe': `<${off}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          unique_args: { category: 'alert', type },
          ...(env.POSTSHIBA_SANDBOX === 'true' ? { sandbox: true } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
  } catch {
    return retryOrFail(row.email_attempts, EMAIL_ATTEMPTS, now, {
      ...tried,
      error: 'PostShiba did not answer in time.',
    })
  }
  if (response.ok) {
    await response.body?.cancel()
    return { state: 'sent', ...tried }
  }
  const body = await readJsonOrUndefined<{ error?: string; message?: string }>(
    response,
    'PostShiba',
  )
  const error = `PostShiba ${response.status} ${body?.error ?? ''}`.trim()
  // A retry with the same key is safe, except after an unknown outcome:
  // PostShiba then sends nothing again, and neither do we.
  if (
    response.status === 429 ||
    response.status >= 500 ||
    body?.error === 'idempotency_in_progress'
  ) {
    return retryOrFail(row.email_attempts, EMAIL_ATTEMPTS, now, {
      ...tried,
      error,
    })
  }
  return { state: 'failed', ...tried, error }
}

function retryOrFail(
  attempts: number,
  max: number,
  now: number,
  outcome: { tried: boolean; error: string },
): Outcome {
  return attempts + 1 >= max
    ? { state: 'failed', ...outcome }
    : { state: 'pending', ...outcome, retryAt: now + backoff(attempts) }
}

// The JSON body every webhook gets (documented in apps/mcp/README.md).
export function webhookBody(
  row: Pick<Row, 'id' | 'type' | 'site' | 'created_at' | 'data'>,
): string {
  return JSON.stringify({
    id: row.id,
    type: row.type,
    site: row.site,
    created_at: new Date(row.created_at).toISOString(),
    data: JSON.parse(row.data),
  })
}

// Standard Webhooks signature: HMAC-SHA256 over "id.timestamp.body" with
// the secret's bytes, base64, as "v1,<signature>".
export async function signature(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (char) =>
    char.charCodeAt(0),
  )
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${body}`),
    ),
  )
  let text = ''
  for (const byte of mac) text += String.fromCharCode(byte)
  return `v1,${btoa(text)}`
}

async function sendWebhook(env: Env, row: Row, now: number): Promise<Outcome> {
  const settings = await alertSettings(env, row.user_id)
  const url = settings.webhookUrl
  const wants = settings.types.find((item) => item.id === row.type)?.webhook
  if (!url || !settings.webhookSecret || !wants) return { state: 'off' }
  const problem = webhookUrlProblem(url)
  if (problem) return { state: 'failed', error: problem }
  const body = webhookBody(row)
  const timestamp = Math.floor(now / 1000)
  const tried = { tried: true }
  const result = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'SEO Skill alerts (+https://seoskill.dev)',
      'webhook-id': row.id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': await signature(
        settings.webhookSecret,
        row.id,
        timestamp,
        body,
      ),
    },
    body,
    // A redirect is never followed, so it cannot lead to a private address.
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).then(
    async (response) => {
      await response.body?.cancel().catch(() => null)
      return response.status
    },
    () => null,
  )
  let outcome: Outcome
  if (result !== null && result >= 200 && result < 300) {
    outcome = { state: 'sent', ...tried }
  } else if (result !== null && result >= 300 && result < 400) {
    outcome = {
      state: 'failed',
      ...tried,
      error: `HTTP ${result}: redirects are not followed`,
    }
  } else if (
    result !== null &&
    result < 500 &&
    result !== 408 &&
    result !== 429
  ) {
    outcome = { state: 'failed', ...tried, error: `HTTP ${result}` }
  } else {
    outcome = retryOrFail(row.webhook_attempts, WEBHOOK_ATTEMPTS, now, {
      ...tried,
      error: result === null ? 'no answer within 10 seconds' : `HTTP ${result}`,
    })
  }
  await recordWebhook(
    env,
    row.user_id,
    outcome.state === 'sent' ? 'ok' : (outcome.error ?? 'failed'),
  )
  return outcome
}
