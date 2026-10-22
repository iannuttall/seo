import type { RunOptions } from './crawler.ts'
import { SiteCrawler } from './crawler.ts'

export { SiteCrawler }

// The proof of concept's Worker: a small token-guarded API to add sites,
// start runs and read reports, and the hourly cron that starts weekly runs.

const WEEK_MS = 7 * 86_400_000
const DUE_PER_TICK = 50
// A run that has not reported back after this long is woken again; start()
// only re-arms its alarm, so this never doubles a run.
const STALE_MS = 6 * 3_600_000

type SiteRow = {
  id: string
  origin: string
  property: string | null
  max_pages: number
  inspect_limit: number
  attempts: number
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function stub(env: Env, siteId: string) {
  return env.SITE.get(env.SITE.idFromName(siteId))
}

// Starts one site's run and moves its schedule only once the object said
// yes. A failed wake backs off 15 minutes, 1 hour, then 4 hours.
async function wake(env: Env, site: SiteRow, now: number): Promise<boolean> {
  try {
    await stub(env, site.id).start(site.id, {
      origin: site.origin,
      property: site.property ?? undefined,
      maxPages: site.max_pages,
      inspectLimit: site.inspect_limit,
    })
    await env.DB.prepare(
      `UPDATE sites SET next_run_at = ?, last_requested_at = ?, attempts = 0, last_error = NULL
       WHERE id = ?`,
    )
      .bind(now + WEEK_MS, now, site.id)
      .run()
    return true
  } catch (error) {
    const backoff = [15, 60, 240][Math.min(site.attempts, 2)] as number
    await env.DB.prepare(
      'UPDATE sites SET next_run_at = ?, attempts = attempts + 1, last_error = ? WHERE id = ?',
    )
      .bind(now + backoff * 60_000, String(error).slice(0, 200), site.id)
      .run()
    return false
  }
}

export async function startDue(env: Env, now = Date.now()) {
  const due = await env.DB.prepare(
    `SELECT id, origin, property, max_pages, inspect_limit, attempts FROM sites
     WHERE next_run_at <= ? ORDER BY next_run_at, id LIMIT ?`,
  )
    .bind(now, DUE_PER_TICK)
    .all<SiteRow>()
  const stale = await env.DB.prepare(
    `SELECT id, origin, property, max_pages, inspect_limit, attempts FROM sites
     WHERE last_requested_at < ? AND (last_finished_at IS NULL OR last_finished_at < last_requested_at)
     ORDER BY last_requested_at, id LIMIT ?`,
  )
    .bind(now - STALE_MS, DUE_PER_TICK)
    .all<SiteRow>()
  let started = 0
  for (const site of due.results) if (await wake(env, site, now)) started += 1
  // Stale runs: re-arm only, without moving the schedule.
  for (const site of stale.results) {
    await stub(env, site.id)
      .start(site.id, { origin: site.origin, maxPages: site.max_pages })
      .catch(() => null)
  }
  return { due: due.results.length, started, stale: stale.results.length }
}

export default {
  async fetch(request, env): Promise<Response> {
    if (
      !env.POC_TOKEN ||
      request.headers.get('authorization') !== `Bearer ${env.POC_TOKEN}`
    ) {
      return json({ error: 'unauthorized' }, 401)
    }
    const url = new URL(request.url)
    const [, resource, siteId, action] = url.pathname.split('/')
    if (resource === 'cron' && request.method === 'POST') {
      return json(
        await startDue(env, Number(url.searchParams.get('now')) || Date.now()),
      )
    }
    if (resource !== 'sites' || !siteId)
      return json({ error: 'not_found' }, 404)
    const site = stub(env, siteId)
    if (action === 'add' && request.method === 'POST') {
      const body = (await request.json()) as RunOptions
      await env.DB.prepare(
        `INSERT INTO sites (id, origin, property, max_pages, inspect_limit, next_run_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET origin = excluded.origin, max_pages = excluded.max_pages,
           inspect_limit = excluded.inspect_limit, next_run_at = excluded.next_run_at`,
      )
        .bind(
          siteId,
          new URL(body.origin).origin,
          body.property ?? null,
          body.maxPages ?? 500,
          body.inspectLimit ?? 0,
          Date.now(),
        )
        .run()
      return json({ ok: true })
    }
    if (action === 'start' && request.method === 'POST') {
      const body = (await request.json()) as RunOptions
      return json(await site.start(siteId, body))
    }
    if (action === 'status') return json(await site.status())
    if (action === 'report') {
      return json(await site.report(url.searchParams.get('new') === '1'))
    }
    return json({ error: 'not_found' }, 404)
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(startDue(env))
  },
} satisfies ExportedHandler<Env>
