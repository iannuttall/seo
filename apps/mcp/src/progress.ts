import type {
  ProgressPoint,
  ProgressRun,
  ProgressStore,
} from '@seo/core/commands'
import { linkOf, unlinked } from './cli.ts'

// The account's weekly progress points and tracking runs for each site in
// D1 (migrations/0021_site_progress.sql). Like the business context they
// are kept for every site, audited or not, and deleted with the account.
export function siteProgress(env: Env, userId: string): ProgressStore {
  return {
    points: async (property) =>
      (
        await env.DB.prepare(
          'SELECT point FROM site_progress WHERE user_id = ? AND property = ? ORDER BY week',
        )
          .bind(userId, property)
          .all<{ point: string }>()
      ).results.map((row) => JSON.parse(row.point) as ProgressPoint),
    addPoint: async (property, point) => {
      const result = await env.DB.prepare(
        `INSERT INTO site_progress (user_id, property, week, point)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, property, week) DO NOTHING`,
      )
        .bind(userId, property, point.week, JSON.stringify(point))
        .run()
      return result.meta.changes > 0
    },
    runs: async (property) =>
      (
        await env.DB.prepare(
          'SELECT run FROM progress_runs WHERE user_id = ? AND property = ? ORDER BY ran_at, id',
        )
          .bind(userId, property)
          .all<{ run: string }>()
      ).results.map((row) => JSON.parse(row.run) as ProgressRun),
    saveRun: async (property, run) => {
      await env.DB.prepare(
        `INSERT INTO progress_runs (user_id, property, id, ran_at, run)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, property, id) DO UPDATE SET
           ran_at = excluded.ran_at, run = excluded.run`,
      )
        .bind(userId, property, run.id, run.ran_at, JSON.stringify(run))
        .run()
    },
  }
}

// A linked CLI's progress for one site, kept with the account like the
// hosted server's (seo login). GET ?property= returns the points and runs;
// POST with property and a point adds it (once a week), with property and a run adds or
// replaces it. The CLI has the account's own sign-ins, so it can write any
// property the account names; the body and the counts are still bounded.
const MAX_BODY = 512_000
const MAX_POINTS = 520
const MAX_RUNS = 600
const WEEK = /^\d{4}-\d{2}-\d{2}$/

export async function cliProgress(
  request: Request,
  env: Env,
): Promise<Response> {
  const link = await linkOf(request, env)
  if (!link) return unlinked()
  const store = siteProgress(env, link.userId)
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  const bad = (message: string) => json({ error: 'invalid', message }, 400)
  if (request.method === 'GET') {
    const site = new URL(request.url).searchParams.get('property') ?? ''
    if (!site || site.length > 300) return bad('property is required.')
    const [points, runs] = await Promise.all([
      store.points(site),
      store.runs(site),
    ])
    return json({ points, runs })
  }
  if (request.method !== 'POST') return bad('GET or POST.')
  const text = await request.text()
  if (text.length > MAX_BODY) return bad('The body is too large.')
  let body: { property?: unknown; point?: ProgressPoint; run?: ProgressRun }
  try {
    body = JSON.parse(text)
  } catch {
    return bad('The body is not JSON.')
  }
  const site = typeof body.property === 'string' ? body.property : ''
  if (!site || site.length > 300) return bad('property is required.')
  if (body.point) {
    if (typeof body.point.week !== 'string' || !WEEK.test(body.point.week)) {
      return bad('point.week is a YYYY-MM-DD Monday.')
    }
    if ((await store.points(site)).length >= MAX_POINTS) {
      return bad(`This site already keeps ${MAX_POINTS} points.`)
    }
    return json({ added: await store.addPoint(site, body.point) })
  }
  if (body.run) {
    const { id, ran_at } = body.run
    if (typeof id !== 'string' || !id || id.length > 100) {
      return bad('run.id is required.')
    }
    if (typeof ran_at !== 'string' || ran_at.length > 40) {
      return bad('run.ran_at is required.')
    }
    const runs = await store.runs(site)
    if (!runs.some((run) => run.id === id) && runs.length >= MAX_RUNS) {
      return bad(`This site already keeps ${MAX_RUNS} checks.`)
    }
    await store.saveRun(site, body.run)
    return json({ ok: true })
  }
  return bad('Send a point or a run.')
}
