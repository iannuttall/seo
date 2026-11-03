import { propertyChoices } from './audit/choices.ts'
import { inWeeklyAudit } from './audit/schedule.ts'
import type { Plan } from './internal-links/run.ts'
import { accountsOf } from './store.ts'

// The internal linking tool page on seoskill.dev, run in the cloud for a
// signed-in account (src/internal-links/run.ts does the work):
//   GET  /account/tools/internal-links?property=...  the latest run and result
//   POST /account/tools/internal-links  {"property": "..."}  starts a run
// Only on a Search Console property one of the person's linked Google
// accounts can read, so nobody can point it at someone else's site.

// The defaults, in one place. A site in the account's weekly site audit
// gets the audit plan; any other property the person can read gets free.
export const INTERNAL_LINKS_LIMITS: Record<
  Plan,
  { pages: number; runsPerDay: number }
> = {
  // Runs a day per account, on SEO Skill's TypeSafe key.
  free: { pages: 100, runsPerDay: 3 },
  // Runs a day per site.
  audit: { pages: 5000, runsPerDay: 3 },
}

const PATH = '/account/tools/internal-links'
const MAX_BODY_BYTES = 2048
const FREE_RUNS = 'internal_links_free_runs'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

// The session cookie goes with any request to /account, so a start must
// come from the site's own pages.
function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin')
  if (origin) return origin === new URL(env.PUBLIC_URL).origin
  return request.headers.get('sec-fetch-site') === 'same-origin'
}

async function propertyOf(request: Request): Promise<string> {
  if (request.method === 'GET') {
    return new URL(request.url).searchParams.get('property') ?? ''
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return ''
  }
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return ''
  try {
    const body = JSON.parse(text) as { property?: unknown }
    return typeof body.property === 'string' ? body.property : ''
  } catch {
    return ''
  }
}

// Drops the person's saved results, for Delete everything and for removing
// a Google account. Reads the property list before the accounts go.
export async function forgetInternalLinks(
  env: Env,
  userId: string,
): Promise<void> {
  const found = await propertyChoices(
    env,
    userId,
    await accountsOf(env, userId),
  )
  await Promise.all(
    found.choices.map(({ property }) =>
      env.INTERNAL_LINKS.get(
        env.INTERNAL_LINKS.idFromName(JSON.stringify([userId, property])),
      ).destroy(),
    ),
  )
}

const today = () => new Date().toISOString().slice(0, 10)

async function freeRunsToday(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT amount FROM usage WHERE user_id = ? AND day = ? AND kind = ?',
  )
    .bind(userId, today(), FREE_RUNS)
    .first<{ amount: number }>()
  return row?.amount ?? 0
}

// Counts one free run unless the account has used today's; false when it
// has. One statement, so two starts at once cannot both get the last run.
async function takeFreeRun(env: Env, userId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO usage (user_id, day, kind, amount) VALUES (?, ?, ?, 1)
     ON CONFLICT (user_id, day, kind) DO UPDATE SET amount = amount + 1
     WHERE amount < ?`,
  )
    .bind(userId, today(), FREE_RUNS, INTERNAL_LINKS_LIMITS.free.runsPerDay)
    .run()
  return result.meta.changes > 0
}

async function giveBackFreeRun(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE usage SET amount = amount - 1
     WHERE user_id = ? AND day = ? AND kind = ? AND amount > 0`,
  )
    .bind(userId, today(), FREE_RUNS)
    .run()
}

export async function internalLinksRoute(
  request: Request,
  env: Env,
  path: string,
  userId: string | null,
): Promise<Response> {
  if (path !== PATH) return json({ error: 'not_found' }, 404)
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'not_found' }, 404)
  }
  if (request.method === 'POST' && !sameOrigin(request, env)) {
    return json({ error: 'Start a run from the tool page.' }, 403)
  }
  if (!userId) return json({ error: 'not_signed_in' }, 401)
  const property = await propertyOf(request)
  if (!property || property.length > 300) {
    return json({ error: 'Pick a Search Console property.' }, 400)
  }
  const found = await propertyChoices(
    env,
    userId,
    await accountsOf(env, userId),
  )
  if (!found.choices.some((choice) => choice.property === property)) {
    return json(
      {
        error:
          'None of your linked Google accounts can read that Search Console property.',
      },
      403,
    )
  }
  const plan: Plan = (await inWeeklyAudit(env, userId, property))
    ? 'audit'
    : 'free'
  const limits = INTERNAL_LINKS_LIMITS[plan]
  const object = env.INTERNAL_LINKS.get(
    env.INTERNAL_LINKS.idFromName(JSON.stringify([userId, property])),
  )

  let status = 200
  if (request.method === 'POST') {
    const before = await object.status()
    const running =
      before.run?.status === 'crawling' ||
      before.run?.status === 'checking' ||
      before.run?.status === 'analysing'
    if (!running) {
      if (plan === 'free' && !(await takeFreeRun(env, userId))) {
        return json(
          {
            error: `You have used today's ${limits.runsPerDay} free runs. More from midnight UTC.`,
          },
          429,
        )
      }
      const outcome = await object
        .start({
          userId,
          property,
          plan,
          maxPages: limits.pages,
          runsPerDay: limits.runsPerDay,
        })
        .catch(async (error: unknown) => {
          if (plan === 'free') await giveBackFreeRun(env, userId)
          throw error
        })
      if (outcome !== 'started' && plan === 'free') {
        await giveBackFreeRun(env, userId)
      }
      if (outcome === 'limit') {
        return json(
          {
            error: `This site has had today's ${limits.runsPerDay} runs. More from midnight UTC.`,
          },
          429,
        )
      }
      status = 202
    }
  }
  const state = await object.status()
  const used =
    plan === 'free' ? await freeRunsToday(env, userId) : state.runsToday.audit
  return json(
    {
      property,
      plan,
      pages: limits.pages,
      runsPerDay: limits.runsPerDay,
      runsLeft: Math.max(0, limits.runsPerDay - used),
      run: state.run,
      result: state.result,
    },
    status,
  )
}
