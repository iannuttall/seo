import {
  bareDomain,
  dataForSeoLanguage,
  dataForSeoMarket,
  dataForSeoTask,
  dateWindow,
  domainRatings,
  GENERIC_PLATFORMS,
  type WeekOpportunities,
  type WeekOpportunity,
} from '@seo/core/commands'
import { type DecisionModel, typesafeDecisionModel } from '@seo/core/hosted'
import { ACTIVE_SQL } from '../billing.ts'
import { directory } from '../google.ts'
import { accountsOf } from '../store.ts'
import { addUnmetered, flushUnmetered } from '../usage.ts'
import type { Google } from './checks.ts'
import type { Meter } from './meter.ts'

// The weekly audit's competitor check, on SEO Skill's own DataForSEO
// account. Once a week it refreshes the keywords the site's competitors
// rank for and the site does not, then names only the few that pass every
// gate: proven by two competitors, worth money, not already the site's,
// a fit with what the site does, and winnable on the live results page.
// Most weeks name none, and that is the product: the agent is never handed
// a long list to keep it busy. Spend is capped per site before each call.

const WEEK_MS = 7 * 86_400_000
const DAY_MS = 86_400_000
// DataForSEO spend per site: a month (UTC) and one weekly run.
export const MONTH_BUDGET_USD = 5
const RUN_BUDGET_USD = 1.5
// A competitor's keywords are fetched again after this long, and count
// toward the gates for this long.
const REFRESH_MS = 28 * DAY_MS
const KEEP_MS = 90 * DAY_MS
// A keyword that failed a paid or model gate is not judged again for this long.
const JUDGED_MS = 28 * DAY_MS
const GAP_ROWS = 500
const SUGGESTED = 5
// Candidates judged a run, and keywords named a week.
const MAX_JUDGED = 15
const MAX_NAMED = 3
// Gates.
const MIN_COMPETITORS = 2
const TOP = 10
const DR_MARGIN = 10
const MIN_LOW_DR = 3
const MIN_TOOL_CLUSTER = 3
const MIN_FIT = 0.75
// An item named before comes back only this much stronger.
const RESURFACE = 1.5
// Worst-case cost of one call, from DataForSEO's published prices
// ($0.012 a task and $0.00012 a row for Labs; competitor endpoints cost
// ten times that), so a call never starts that could pass the budget.
const COST = {
  competitors: 0.12 + 20 * 0.0012,
  gap: 0.012 + GAP_ROWS * 0.00012,
  serp: 0.004,
}
const MONEY_INTENTS = new Set(['commercial', 'transactional'])
// Words that mark a free tool (a heuristic from the words only).
const TOOL =
  /\b(calculators?|checkers?|generators?|converters?|templates?|tools?|makers?|finders?|planners?|estimators?|counters?|testers?|validators?|analy[sz]ers?|builders?|creators?|quiz(zes)?)\b/i

export const TABLES = `
CREATE TABLE IF NOT EXISTS gap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_at INTEGER,
  -- DataForSEO spend this UTC month (YYYY-MM), in USD.
  month TEXT,
  spent_usd REAL NOT NULL DEFAULT 0,
  checked_at INTEGER,
  blocked TEXT,
  partial INTEGER NOT NULL DEFAULT 0
);
-- When each competitor's keywords were last fetched.
CREATE TABLE IF NOT EXISTS gap_fetches (
  competitor TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL
);
-- Keywords a competitor ranks for and the site does not, up to GAP_ROWS
-- each, as DataForSEO estimates them.
CREATE TABLE IF NOT EXISTS gap_rows (
  competitor TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  search_volume INTEGER NOT NULL,
  cpc REAL NOT NULL,
  intent TEXT,
  PRIMARY KEY (competitor, keyword)
);
-- Keywords that failed a gate that costs money or a model call.
CREATE TABLE IF NOT EXISTS gap_judged (
  keyword TEXT PRIMARY KEY,
  judged_at INTEGER NOT NULL,
  reason TEXT NOT NULL
);
-- Keywords named in a weekly summary, so none is named twice unless it
-- grew stronger.
CREATE TABLE IF NOT EXISTS opportunities (
  keyword TEXT PRIMARY KEY,
  surfaced_at INTEGER NOT NULL,
  strength REAL NOT NULL,
  details TEXT NOT NULL
);
`

export type GapRow = {
  competitor: string
  keyword: string
  position: number
  url: string
  search_volume: number
  cpc: number
  intent: string | null
}

export type Candidate = Omit<
  WeekOpportunity,
  'site_dr' | 'low_dr' | 'top' | 'relevance'
> & { strength: number }

// The keywords that pass the free gates, strongest first: at least two
// competitors in the top 10, worth money (commercial or transactional
// intent and a CPC; for a free tool, any intent but navigational and a
// competitor tool page that ranks for at least three paying keywords), and
// not named before unless 50% stronger. Strength is volume times CPC.
export function shortlist(
  rows: GapRow[],
  named: Map<string, number>,
  failed: Set<string>,
): Candidate[] {
  const pages = new Map<string, number>()
  for (const row of rows) {
    if (row.cpc <= 0) continue
    const page = `${row.competitor} ${row.url}`
    pages.set(page, (pages.get(page) ?? 0) + 1)
  }
  const byKeyword = new Map<string, GapRow[]>()
  for (const row of rows) {
    if (row.position > TOP) continue
    const list = byKeyword.get(row.keyword) ?? []
    list.push(row)
    byKeyword.set(row.keyword, list)
  }
  const found: Candidate[] = []
  for (const [keyword, ranked] of byKeyword) {
    if (failed.has(keyword)) continue
    const domains = new Set(ranked.map((row) => row.competitor))
    if (domains.size < MIN_COMPETITORS) continue
    // Keyword metrics are the same in every competitor's row.
    const { search_volume, cpc, intent } = ranked[0] as GapRow
    if (cpc <= 0 || search_volume <= 0 || intent === 'navigational') continue
    const tool =
      TOOL.test(keyword) || ranked.some((row) => TOOL.test(path(row.url)))
    const cluster = tool
      ? Math.max(
          ...ranked.map(
            (row) => pages.get(`${row.competitor} ${row.url}`) ?? 0,
          ),
        )
      : 0
    const paying = tool
      ? cluster >= MIN_TOOL_CLUSTER
      : MONEY_INTENTS.has(intent ?? '')
    if (!paying) continue
    const strength = search_volume * cpc
    const before = named.get(keyword)
    if (before !== undefined && strength < before * RESURFACE) continue
    found.push({
      keyword,
      kind: tool ? 'tool' : 'page',
      search_volume,
      cpc,
      intent: intent ?? 'unknown',
      competitors: ranked
        .map(({ competitor, position, url }) => ({
          domain: competitor,
          position,
          url,
        }))
        .sort(
          (a, b) => a.position - b.position || a.domain.localeCompare(b.domain),
        ),
      cluster,
      strength,
    })
  }
  return found.sort(
    (a, b) => b.strength - a.strength || a.keyword.localeCompare(b.keyword),
  )
}

const path = (url: string) => {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

// A nested field of a provider item, or undefined.
const at = (value: unknown, field: string): unknown =>
  field
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    )

// Search Console countries are ISO alpha-3; DataForSEO Labs takes the
// alpha-2 code of the countries it has data for.
const ALPHA2 = new Map(
  `are:ae alb:al arm:am ago:ao arg:ar aut:at aus:au aze:az bih:ba bgd:bd
  bel:be bfa:bf bgr:bg bhr:bh bol:bo bra:br can:ca che:ch civ:ci chl:cl
  cmr:cm col:co cri:cr cyp:cy cze:cz deu:de dnk:dk dza:dz ecu:ec est:ee
  egy:eg esp:es fin:fi fra:fr gbr:gb gha:gh grc:gr gtm:gt hkg:hk hrv:hr
  hun:hu idn:id irl:ie isr:il ind:in ita:it jor:jo jpn:jp ken:ke khm:kh
  kor:kr kaz:kz lka:lk ltu:lt lva:lv mar:ma mco:mc mda:md mkd:mk mmr:mm
  mlt:mt mex:mx mys:my nga:ng nic:ni nld:nl nor:no nzl:nz pan:pa per:pe
  phl:ph pak:pk pol:pl prt:pt pry:py rou:ro srb:rs sau:sa swe:se sgp:sg
  svn:si svk:sk sen:sn slv:sv tha:th tun:tn tur:tr twn:tw ukr:ua usa:us
  ury:uy ven:ve vnm:vn zaf:za`
    .split(/\s+/)
    .map((pair) => pair.split(':') as [string, string]),
)

type State = {
  next_at: number | null
  month: string | null
  spent_usd: number
  checked_at: number | null
  blocked: string | null
  partial: number
}

export function gapState(meter: Meter): State | null {
  return meter.one<State>('SELECT * FROM gap_state')
}

function saveState(meter: Meter, fields: Partial<State>): void {
  const next = {
    next_at: null,
    month: null,
    spent_usd: 0,
    checked_at: null,
    blocked: null,
    partial: 0,
    ...gapState(meter),
    ...fields,
  }
  meter.run(
    `INSERT INTO gap_state (id, next_at, month, spent_usd, checked_at, blocked, partial)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET next_at = excluded.next_at, month = excluded.month,
       spent_usd = excluded.spent_usd, checked_at = excluded.checked_at,
       blocked = excluded.blocked, partial = excluded.partial`,
    next.next_at,
    next.month,
    next.spent_usd,
    next.checked_at,
    next.blocked,
    next.partial,
  )
}

export type GapSite = { user_id: string; property: string }

// The site's market: the country with the most clicks in 28 days, as
// Search Console's alpha-3 code and DataForSEO's alpha-2 code (null when
// DataForSEO has no data for it).
export async function topCountry(
  search: ReturnType<Google['searchAnalytics']>,
  property: string,
): Promise<{ alpha3: string; country: string | null }> {
  const countries = await search(property, {
    ...dateWindow({}, 28),
    dimensions: ['country'],
    type: 'web',
    maxRows: 1,
  })
  const alpha3 = countries.rows[0]?.keys[0]?.toLowerCase() ?? 'usa'
  return { alpha3, country: ALPHA2.get(alpha3) ?? null }
}

// Whether this account's sites get the check: a paid plan, or the
// maintainer's unlimited-sites flag. Free beta sites do not.
export async function included(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT EXISTS (SELECT 1 FROM billing WHERE user_id = ?1 AND status IN ${ACTIVE_SQL})
       OR EXISTS (SELECT 1 FROM beta_flags WHERE user_id = ?1 AND flag = 'unlimited-sites') AS n`,
  )
    .bind(userId)
    .first<{ n: number }>()
  return row?.n === 1
}

// One check when it is due. Returns when it is due next, or null when the
// check is off on this server.
export async function runGapCheck(
  env: Env,
  meter: Meter,
  site: GapSite,
  google: Google,
  now = Date.now(),
): Promise<number | null> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return null
  const state = gapState(meter)
  if (state?.next_at && state.next_at > now) return state.next_at
  if (!(await included(env, site.user_id))) {
    saveState(meter, { next_at: now + DAY_MS })
    return now + DAY_MS
  }
  const month = new Date(now).toISOString().slice(0, 7)
  let spent = state?.month === month ? state.spent_usd : 0
  const cap = Math.min(spent + RUN_BUDGET_USD, MONTH_BUDGET_USD)
  let partial = false
  const keys = [env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD]
  // One DataForSEO task, only when its worst case fits the budget. The
  // spend is saved with the call, so an eviction never forgets it.
  const paid = async (
    estimate: number,
    path: string,
    task: Record<string, unknown>,
  ): Promise<Record<string, unknown>[] | null> => {
    if (spent + estimate > cap) {
      partial = true
      return null
    }
    const record = (cost: number) => {
      spent += cost
      meter.transaction(() => {
        saveState(meter, { month, spent_usd: spent })
        addUnmetered(
          meter,
          'included_dataforseo_microusd',
          Math.round(cost * 1_000_000),
        )
      })
    }
    try {
      const done = await dataForSeoTask(keys, path, task)
      record(done.cost)
      return (done.result?.items as Record<string, unknown>[] | undefined) ?? []
    } catch (error) {
      record((error as { cost?: number }).cost ?? estimate)
      throw error
    }
  }
  const finish = (blocked: string | null) => {
    saveState(meter, {
      next_at: now + WEEK_MS,
      month,
      spent_usd: spent,
      checked_at: now,
      blocked,
      partial: partial ? 1 : 0,
    })
    return now + WEEK_MS
  }

  const domain = bareDomain(site.property)
  const range = dateWindow({}, 28)
  const search = google.searchAnalytics()
  const { alpha3, country } = await topCountry(search, site.property)
  const language = country ? dataForSeoLanguage(country) : null
  if (!country || !language) {
    return finish(
      `DataForSEO has no keyword data for the country most of the site's clicks come from (${alpha3.toUpperCase()})`,
    )
  }
  const market = dataForSeoMarket(country, language)
  const siteDr = (await domainRatings([domain], env.AHREFS_DR_KEY)).get(domain)
  if (siteDr == null) {
    return finish(
      'Domain Rating by Ahrefs was not available for the site, so no keyword could be judged winnable this week',
    )
  }

  // The competitors: the person's list, else DataForSEO's suggestions.
  const row = await env.DB.prepare(
    'SELECT competitors, competitors_chosen FROM audit_sites WHERE user_id = ? AND property = ?',
  )
    .bind(site.user_id, site.property)
    .first<{ competitors: string | null; competitors_chosen: number }>()
  if (!row) return null
  let competitors = row.competitors
    ? (JSON.parse(row.competitors) as string[])
    : []
  if (!competitors.length && !row.competitors_chosen) {
    const items = await paid(
      COST.competitors,
      'v3/dataforseo_labs/google/competitors_domain/live',
      { ...market, target: domain, limit: 20 },
    )
    const within = (name: string, parent: string) =>
      name === parent || name.endsWith(`.${parent}`)
    competitors = (items ?? [])
      .map((item) => ({
        name: bareDomain(String(item.domain ?? '')),
        shared: Number(item.intersections ?? 0),
      }))
      .filter(
        ({ name }) =>
          name &&
          !within(name, domain) &&
          !within(domain, name) &&
          !GENERIC_PLATFORMS.some((platform) => within(name, platform)),
      )
      .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name))
      .slice(0, SUGGESTED)
      .map(({ name }) => name)
    if (competitors.length) {
      await env.DB.prepare(
        `UPDATE audit_sites SET competitors = ? WHERE user_id = ? AND property = ? AND competitors_chosen = 0`,
      )
        .bind(JSON.stringify(competitors), site.user_id, site.property)
        .run()
    }
  }
  // Rows of competitors no longer tracked, and old rows, go.
  const tracked = JSON.stringify(competitors)
  meter.transaction(() => {
    meter.run(
      `DELETE FROM gap_rows WHERE competitor NOT IN (SELECT value FROM json_each(?))
         OR competitor IN (SELECT competitor FROM gap_fetches WHERE fetched_at < ?)`,
      tracked,
      now - KEEP_MS,
    )
    meter.run(
      `DELETE FROM gap_fetches WHERE competitor NOT IN (SELECT value FROM json_each(?)) OR fetched_at < ?`,
      tracked,
      now - KEEP_MS,
    )
    meter.run('DELETE FROM gap_judged WHERE judged_at < ?', now - JUDGED_MS)
  })
  if (competitors.length < MIN_COMPETITORS) {
    return finish(
      'It needs at least two competitors, so a keyword is proven by more than one site. Add them on the site page',
    )
  }

  // Refresh the stalest competitors first, so a long list rotates within
  // the budget.
  const fetched = new Map(
    meter
      .all<{ competitor: string; fetched_at: number }>(
        'SELECT competitor, fetched_at FROM gap_fetches',
      )
      .map((item) => [item.competitor, item.fetched_at]),
  )
  const stale = competitors
    .filter((name) => (fetched.get(name) ?? 0) < now - REFRESH_MS)
    .sort(
      (a, b) =>
        (fetched.get(a) ?? 0) - (fetched.get(b) ?? 0) || a.localeCompare(b),
    )
  for (const competitor of stale) {
    const items = await paid(
      COST.gap,
      'v3/dataforseo_labs/google/domain_intersection/live',
      {
        ...market,
        target1: competitor,
        target2: domain,
        intersections: false,
        item_types: ['organic'],
        filters: [
          ['first_domain_serp_element.rank_absolute', '<=', TOP],
          'and',
          ['keyword_data.keyword_info.cpc', '>', 0],
        ],
        order_by: ['keyword_data.keyword_info.search_volume,desc'],
        limit: GAP_ROWS,
      },
    ).catch(() => null)
    if (items === null) {
      if (partial) break
      continue
    }
    meter.transaction(() => {
      meter.run('DELETE FROM gap_rows WHERE competitor = ?', competitor)
      for (const item of items) {
        const keyword = String(at(item, 'keyword_data.keyword') ?? '')
          .trim()
          .toLowerCase()
        const url = at(item, 'first_domain_serp_element.url')
        if (!keyword || typeof url !== 'string') continue
        const intent = at(item, 'keyword_data.search_intent_info.main_intent')
        meter.run(
          `INSERT OR REPLACE INTO gap_rows (competitor, keyword, position, url, search_volume, cpc, intent)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          competitor,
          keyword,
          Number(at(item, 'first_domain_serp_element.rank_absolute') ?? 101),
          url,
          Number(at(item, 'keyword_data.keyword_info.search_volume') ?? 0),
          Number(at(item, 'keyword_data.keyword_info.cpc') ?? 0),
          typeof intent === 'string' ? intent : null,
        )
      }
      meter.run(
        `INSERT INTO gap_fetches (competitor, fetched_at) VALUES (?, ?)
         ON CONFLICT (competitor) DO UPDATE SET fetched_at = excluded.fetched_at`,
        competitor,
        now,
      )
    })
  }

  // The free gates, then the paid ones on the shortlist only.
  const named = new Map(
    meter
      .all<{ keyword: string; strength: number }>(
        'SELECT keyword, strength FROM opportunities',
      )
      .map((item) => [item.keyword, item.strength]),
  )
  const failed = new Set(
    meter
      .all<{ keyword: string }>('SELECT keyword FROM gap_judged')
      .map((item) => item.keyword),
  )
  const rows = meter.all<GapRow>('SELECT * FROM gap_rows')
  const all = shortlist(rows, named, failed)
  const list = all.slice(0, MAX_JUDGED)
  if (all.length > MAX_JUDGED) partial = true
  if (!list.length) return finish(null)
  const fail = (keyword: string, reason: string) =>
    meter.run(
      `INSERT OR REPLACE INTO gap_judged (keyword, judged_at, reason) VALUES (?, ?, ?)`,
      keyword,
      now,
      reason,
    )

  // Not the site's already: any Search Console impressions in 28 days.
  const open: Candidate[] = []
  for (const item of list) {
    const found = await search(site.property, {
      ...range,
      dimensions: ['query'],
      type: 'web',
      maxRows: 1,
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'query',
              operator: 'equals',
              expression: item.keyword,
            },
          ],
        },
      ],
    }).catch(() => null)
    if (!found) continue
    if ((found.rows[0]?.impressions ?? 0) > 0) fail(item.keyword, 'covered')
    else open.push(item)
  }
  if (!open.length) return finish(null)

  // Fit with what the site does, from its own top queries.
  if (!env.TYPESAFE_API_KEY) {
    return finish(
      'The check that a keyword fits what the site does is not set up on this server, so no keyword was named',
    )
  }
  const top = await search(site.property, {
    ...range,
    dimensions: ['query'],
    type: 'web',
    maxRows: 25,
  })
  const fit = await askFit(
    typesafeDecisionModel({ apiKey: env.TYPESAFE_API_KEY }),
    domain,
    top.rows.map((item) => item.keys[0] ?? '').filter(Boolean),
    open,
  ).catch(() => null)
  if (!fit) {
    return finish(
      'The check that a keyword fits what the site does did not answer this week',
    )
  }

  // Winnable: at least three of the live top 10 at or below the site's
  // Domain Rating plus 10, with the site itself not in them.
  let surfaced = 0
  for (const [index, item] of open.entries()) {
    if (surfaced >= MAX_NAMED) {
      if (index < open.length) partial = true
      break
    }
    const relevance = fit.get(item.keyword) ?? 0
    if (relevance < MIN_FIT) {
      fail(item.keyword, 'fit')
      continue
    }
    const items = await paid(COST.serp, 'v3/serp/google/organic/live/regular', {
      ...market,
      keyword: item.keyword,
      depth: TOP,
    }).catch(() => null)
    if (items === null) {
      if (partial) break
      continue
    }
    const domains = items
      .filter((result) => result.type === 'organic')
      .slice(0, TOP)
      .map((result) => bareDomain(String(result.domain ?? '')))
    if (
      domains.some((name) => name === domain || name.endsWith(`.${domain}`))
    ) {
      fail(item.keyword, 'covered')
      continue
    }
    const ratings = await domainRatings(domains, env.AHREFS_DR_KEY)
    const low = domains.filter((name) => {
      const dr = ratings.get(name)
      return dr != null && dr <= siteDr + DR_MARGIN
    }).length
    if (low < MIN_LOW_DR) {
      fail(item.keyword, 'strong')
      continue
    }
    const { strength, ...rest } = item
    const details: WeekOpportunity = {
      ...rest,
      site_dr: Math.round(siteDr),
      low_dr: low,
      top: domains.length,
      relevance: Math.round(relevance * 100) / 100,
    }
    meter.run(
      `INSERT OR REPLACE INTO opportunities (keyword, surfaced_at, strength, details)
       VALUES (?, ?, ?, ?)`,
      item.keyword,
      now,
      strength,
      JSON.stringify(details),
    )
    surfaced += 1
  }
  return finish(null)
}

// The check from the site object's alarm, when due and no crawl runs,
// then the latest result to D1 for the weekly summary. It shares the one alarm:
// this sets it to the check's next wake only when that is sooner. A failed
// check tries again in a day; nothing here stops the alarm's other work.
// Returns the site row, for the alarm's other checks.
export async function gapWake<S extends GapSite>(
  env: Env,
  meter: Meter,
  storage: DurableObjectStorage,
): Promise<S | null> {
  const site = meter.one<S>('SELECT * FROM site')
  const run = meter.one<{ status: string }>('SELECT status FROM run')
  if (!site || run?.status === 'running') return site
  let at: number | null
  try {
    const accounts = await accountsOf(env, site.user_id)
    at = await runGapCheck(env, meter, site, directory(env, accounts))
  } catch {
    at = Date.now() + DAY_MS
    saveState(meter, { next_at: at })
  }
  await flushUnmetered(env, meter, site.user_id)
  // Pushed on every wake after the first check, so a failed push is
  // repaired by the next one.
  if (gapState(meter)?.checked_at) {
    await env.DB.prepare(
      'UPDATE audit_sites SET opportunities = ? WHERE user_id = ? AND property = ?',
    )
      .bind(JSON.stringify(gapResult(meter)), site.user_id, site.property)
      .run()
      .catch(() => null)
  }
  if (at === null) return site
  const current = await storage.getAlarm().catch(() => null)
  if (current === null || at < current) await storage.setAlarm(at)
  return site
}

// One decision model request: for each keyword, the probability it fits
// what the site does, judged from the site's own top search queries.
async function askFit(
  model: DecisionModel,
  domain: string,
  queries: string[],
  items: Candidate[],
): Promise<Map<string, number>> {
  const fit = new Map<string, number>()
  for (let start = 0; start < items.length; start += 10) {
    const batch = items.slice(start, start + 10)
    const answer = await model.ask({
      state: {
        site: domain,
        site_top_search_queries: queries,
        keywords: batch.map((item) => ({
          keyword: item.keyword,
          competitor_pages: item.competitors.map((c) => c.url),
        })),
      },
      questions: Object.fromEntries(
        batch.map((item, index) => [
          `k${index}`,
          {
            type: 'noul',
            instructions: `Is someone searching "${item.keyword}" squarely looking for what this site itself offers, sells or covers, judged from the site's own top search queries?`,
            criteria: {
              true: 'The keyword is about the same product, service or subject as the site, so a page for it would serve the site’s own audience and business.',
              false:
                'The keyword is adjacent, generic, or only shared with competitors who do more than this site, so ranking for it would bring visitors the site does not serve.',
            },
          },
        ]),
      ),
    })
    batch.forEach((item, index) => {
      const value = answer.answers[`k${index}`]
      fit.set(item.keyword, value?.type === 'noul' ? value.noul : 0)
    })
  }
  return fit
}

// The latest check for D1: the competitors whose keywords count, why it
// could not judge, whether it stopped early, and the keywords named in the
// last 12 weeks with when, strongest first. The weekly summary picks its
// week's keywords from it (audit/week.ts).
export type GapResult = Omit<WeekOpportunities, 'items'> & {
  items: (WeekOpportunity & { surfaced_at: number })[]
}

function gapResult(meter: Meter, now = Date.now()): GapResult {
  const state = gapState(meter)
  return {
    checked_at: state?.checked_at ?? null,
    competitors: meter
      .all<{ competitor: string }>(
        'SELECT competitor FROM gap_fetches WHERE fetched_at >= ? ORDER BY competitor',
        now - KEEP_MS,
      )
      .map((row) => row.competitor),
    blocked: state?.blocked ?? null,
    partial: state?.partial === 1,
    items: meter
      .all<{ details: string; surfaced_at: number }>(
        `SELECT details, surfaced_at FROM opportunities WHERE surfaced_at >= ?
         ORDER BY strength DESC, keyword`,
        now - 12 * WEEK_MS,
      )
      .map((row) => ({
        ...(JSON.parse(row.details) as WeekOpportunity),
        surfaced_at: row.surfaced_at,
      })),
  }
}
