import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { brandRegex, type ContextStore } from './context.js'
import { marketLine, savedMarketTotals } from './markets.js'
import { BRAND_DATA_FROM, isFolderProperty, rowTextFilters } from './rows.js'
import type { Caller, DateRange } from './types.js'

// Brand and non-brand searches two ways, side by side: by the brand names
// the person saved in the business context, and by Google's own
// classification (brandedClassification). Google classifies only top-level
// properties with enough searches, from BRAND_DATA_FROM, and answers a
// property it does not classify with no rows, so no rows is "not
// classified", never zero brand searches.

type Totals = { clicks: number; impressions: number }
type Split = { brand: Totals; non_brand: Totals }

export type BrandPeriod = DateRange & {
  total: Totals
  // Google's split, or null when Google gives none for these dates.
  google: Split | null
  // The split by the saved brand names, or null without names. It counts
  // only the queries Search Console shows, so it adds up to less than total.
  names: Split | null
}

export type BrandSplit = {
  google:
    | 'classified'
    | 'folder-property'
    | 'before-data'
    | 'not-classified'
    | 'error'
  names: string[]
  current: BrandPeriod
  previous: BrandPeriod
  // Fewer clicks than MIN_CLICKS in the current period: too small to judge.
  small: boolean
  // The two ways differ by more than DIFFER on brand clicks (a heuristic).
  differ: boolean
  // With differ: Google's brand searches the saved names miss that are safe
  // to save as a name (see safeNames), most brand clicks first; null when
  // they could not be read. checked_all is false when the query rows hit
  // the row limit, so an empty list is not an all-clear.
  missing?: {
    safe: { name: string; clicks: number }[]
    unsafe: string[]
    checked_all: boolean
  } | null
}

const MIN_CLICKS = 50
// A name is safe to save when at least this share of the clicks it would
// hide (every search that contains it) are ones Google counts as brand.
const SAFE_SHARE = 0.8
// Fewer brand clicks than this is too small to be worth a name, such as a
// one-off spelling.
const MIN_NAME_CLICKS = 5
const QUERY_ROWS = 25_000
const LISTED = 5

type QueryRow = { query: string; clicks: number }

// Google's brand searches that the saved names miss, split into names that
// are safe to save and ones that would hide searches Google counts as not
// brand. A saved name hides every search that contains it, ignoring case,
// as brandRegex matches. Pure.
export function safeNames(
  branded: QueryRow[],
  all: QueryRow[],
  names: string[],
): { safe: { name: string; clicks: number }[]; unsafe: string[] } {
  const lower = names.map((name) => name.toLowerCase())
  const caught = (query: string) =>
    lower.some((name) => query.toLowerCase().includes(name))
  const brand = new Map(branded.map((row) => [row.query.toLowerCase(), row]))
  const share = (candidate: string) => {
    let hidden = 0
    let brandClicks = 0
    for (const row of all) {
      const query = row.query.toLowerCase()
      if (!query.includes(candidate)) continue
      hidden += row.clicks
      if (brand.has(query)) brandClicks += row.clicks
    }
    return hidden > 0 ? brandClicks / hidden : 0
  }
  const open = branded
    .filter((row) => row.clicks > 0 && !caught(row.query))
    .sort((a, b) => b.clicks - a.clicks || a.query.localeCompare(b.query))
  const safe: { name: string; clicks: number }[] = []
  const unsafe: string[] = []
  for (const row of open) {
    const name = row.query.toLowerCase()
    // A longer search that contains a safe name is covered by it.
    if (safe.some((item) => name.includes(item.name))) continue
    if (share(name) < SAFE_SHARE) unsafe.push(name)
    else if (row.clicks >= MIN_NAME_CLICKS)
      safe.push({ name, clicks: row.clicks })
  }
  return { safe: safe.slice(0, LISTED), unsafe: unsafe.slice(0, LISTED) }
}
const DIFFER = { clicks: 20, share: 0.25 }

const zero = (): Totals => ({ clicks: 0, impressions: 0 })

export async function brandSplit(
  read: SearchAnalyticsQuery,
  site: string,
  current: DateRange,
  previous: DateRange,
  names: string[],
): Promise<BrandSplit> {
  const regex = brandRegex(names)
  const folder = isFolderProperty(site)
  const total = async (range: DateRange, filters = rowTextFilters({})) =>
    (
      await read(site, {
        ...range,
        dimensions: [],
        type: 'web',
        dataState: 'final',
        maxRows: 1,
        ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}),
      })
    ).rows[0] ?? zero()
  const google = async (range: DateRange): Promise<Split | null> => {
    if (folder || range.startDate < BRAND_DATA_FROM) return null
    const { rows } = await read(site, {
      ...range,
      dimensions: ['brandedClassification'],
      type: 'web',
      dataState: 'final',
      maxRows: 10,
    })
    if (!rows.length) return null
    const side = (key: string): Totals => {
      const row = rows.find((item) => item.keys?.[0]?.toUpperCase() === key)
      return row ? { clicks: row.clicks, impressions: row.impressions } : zero()
    }
    return { brand: side('BRANDED'), non_brand: side('NON_BRANDED') }
  }
  let failed = false
  const period = async (range: DateRange): Promise<BrandPeriod> => {
    const [all, byGoogle, brand, nonBrand] = await Promise.all([
      total(range),
      google(range).catch(() => {
        failed = true
        return null
      }),
      regex ? total(range, rowTextFilters({ queryRegex: regex })) : null,
      regex ? total(range, rowTextFilters({ excludeQueryRegex: regex })) : null,
    ])
    return {
      ...range,
      total: { clicks: all.clicks, impressions: all.impressions },
      google: byGoogle,
      names:
        brand && nonBrand
          ? {
              brand: { clicks: brand.clicks, impressions: brand.impressions },
              non_brand: {
                clicks: nonBrand.clicks,
                impressions: nonBrand.impressions,
              },
            }
          : null,
    }
  }
  const [now, before] = await Promise.all([period(current), period(previous)])
  const status: BrandSplit['google'] = folder
    ? 'folder-property'
    : current.startDate < BRAND_DATA_FROM
      ? 'before-data'
      : now.google
        ? 'classified'
        : failed
          ? 'error'
          : 'not-classified'
  const a = now.google?.brand.clicks
  const b = now.names?.brand.clicks
  const differ =
    a !== undefined &&
    b !== undefined &&
    Math.abs(a - b) > Math.max(DIFFER.clicks, DIFFER.share * Math.max(a, b))
  // Only a gap needs the query rows: two more Search Console calls.
  const missing = differ
    ? await (async () => {
        const rows = (body: Record<string, unknown>) =>
          read(site, {
            ...current,
            dimensions: ['query'],
            type: 'web',
            dataState: 'final',
            maxRows: QUERY_ROWS,
            ...body,
          }).then((result) =>
            result.rows.map((row) => ({
              query: String(row.keys?.[0] ?? ''),
              clicks: row.clicks,
            })),
          )
        const [branded, all] = await Promise.all([
          rows({
            dimensionFilterGroups: [
              {
                filters: [
                  {
                    dimension: 'brandedClassification',
                    operator: 'equals',
                    expression: 'BRANDED',
                  },
                ],
              },
            ],
          }),
          rows({}),
        ])
        return {
          ...safeNames(branded, all, names),
          checked_all: all.length < QUERY_ROWS && branded.length < QUERY_ROWS,
        }
      })().catch(() => null)
    : undefined
  return {
    google: status,
    names,
    current: now,
    previous: before,
    small: now.total.clicks < MIN_CLICKS,
    differ,
    ...(missing === undefined ? {} : { missing }),
  }
}

// Not-brand clicks and impressions in both periods by one source: Google's
// classification when it covers both, else the saved brand names, else
// null.
export function notBrand(split: BrandSplit): {
  by: 'google' | 'brand_names'
  current: Totals
  previous: Totals
  brand: Totals
  previous_brand: Totals
} | null {
  const google = split.current.google && split.previous.google
  const now = google ? split.current.google : split.current.names
  const then = google ? split.previous.google : split.previous.names
  if (!now || !then) return null
  return {
    by: google ? 'google' : 'brand_names',
    current: now.non_brand,
    previous: then.non_brand,
    brand: now.brand,
    previous_brand: then.brand,
  }
}

export const NOT_BRAND_BY = {
  google: 'Google’s brand classification',
  brand_names: 'your saved brand names',
} as const

const count = (n: number) => Math.round(n).toLocaleString('en-US')

function share(split: Split): string {
  const all = split.brand.clicks + split.non_brand.clicks
  return all > 0
    ? `${Math.round((split.non_brand.clicks / all) * 100)}% of these clicks not brand`
    : 'no clicks'
}

function sideText(now: Split, then: Split | null): string {
  const was = (value: number | undefined) =>
    value === undefined ? '' : ` (was ${count(value)})`
  return `brand ${count(now.brand.clicks)} clicks${was(then?.brand.clicks)}, not brand ${count(now.non_brand.clicks)}${was(then?.non_brand.clicks)}, ${share(now)}`
}

const GOOGLE_MISSING: Record<
  Exclude<BrandSplit['google'], 'classified'>,
  string
> = {
  'folder-property':
    'Google classifies brand searches only for top-level properties, not a folder property like this one.',
  'before-data': `Google classifies brand searches only from ${BRAND_DATA_FROM}, and these dates start earlier.`,
  'not-classified':
    'Google returned no brand classification for this property. It classifies only top-level properties with enough searches, so this means not classified, not zero brand searches.',
  error: 'Google’s brand classification could not be read.',
}

// The split as lines, the same in the report, compare and the emails.
export function brandSplitLines(split: BrandSplit, branded?: string): string[] {
  const lines: string[] = []
  const { current: now, previous: then } = split
  // Google's classification leads when it has one: what Google counts as
  // brand is brand. The saved names are the fallback, and what page and
  // query lists use, since Google does not classify a query-filtered cut.
  if (now.google) {
    lines.push(
      `By Google’s brand classification: ${sideText(now.google, then.google)}.${then.google ? '' : ` The earlier dates have no classification (it starts ${BRAND_DATA_FROM}), so there is no change to show.`}`,
    )
  } else if (split.google !== 'classified') {
    lines.push(GOOGLE_MISSING[split.google])
  }
  if (now.names) {
    lines.push(
      `By your brand names (${split.names.join(', ')})${now.google ? ', used for page and query lists' : ''}: ${sideText(now.names, then.names)}. Counts only the searches Search Console shows.`,
    )
  } else {
    lines.push(
      'No brand names are saved in the business context ("## Brand names"), so there is no split by name.',
    )
  }
  const missing = split.missing
  if (split.differ && missing && !missing.safe.length && missing.checked_all) {
    // The saved names already hold every name that is safe to save.
    lines.push(
      `Google counts more brand clicks than your brand names because of searches such as ${missing.unsafe.map((q) => `"${q}"`).join(', ') || 'ones Search Console hides'}, which would also hide searches Google counts as not brand if saved as names.`,
    )
  } else if (split.differ && missing?.safe.length) {
    lines.push(
      `Google counts ${count(now.google?.brand.clicks ?? 0)} brand clicks and your brand names ${count(now.names?.brand.clicks ?? 0)}. Safe to add to "## Brand names", because Google counts at least ${Math.round(SAFE_SHARE * 100)}% of the clicks each would hide as brand: ${missing.safe.map((item) => `${item.name} (${count(item.clicks)} brand ${item.clicks === 1 ? 'click' : 'clicks'})`).join(', ')}.${missing.checked_all ? '' : ' Search Console returned the row limit, so there may be more.'}`,
    )
  } else if (split.differ) {
    lines.push(
      `Google counts ${count(now.google?.brand.clicks ?? 0)} brand clicks and your brand names ${count(now.names?.brand.clicks ?? 0)} (a gap of more than 25%, a heuristic). Google’s count is the one to go by. The saved names decide only which searches page and query lists leave out, and a name there hides every search that contains it, so add a name from the searches Google counts as brand only when Google counts at least 80% of the clicks that name would catch as brand${branded ? `. Google’s brand searches: ${branded}` : ''}.`,
    )
  }
  if (split.small) {
    lines.push(
      `${count(now.total.clicks)} clicks in these dates, too few to judge the split.`,
    )
  }
  return lines.length
    ? [`Brand and not brand:`, ...lines.map((l) => `- ${l}`)]
    : []
}

// The brand split and the saved market groups for two date ranges, as data
// and text, the same in the report overview and compare. A failed read
// leaves its part out and never stops the report.
export async function splitsBeside(
  store: ContextStore | undefined,
  read: SearchAnalyticsQuery,
  site: string,
  current: DateRange,
  previous: DateRange,
  names: string[],
  call: Caller,
) {
  const [split, markets] = await Promise.all([
    brandSplit(read, site, current, previous, names).catch(() => null),
    savedMarketTotals(store, read, site, current, previous),
  ])
  return {
    data: {
      ...(split ? { brand_split: split } : {}),
      ...(markets ? { markets } : {}),
    },
    text: [
      split
        ? brandSplitLines(
            split,
            call('data', { site, dimensions: 'query', brand: 'branded' }),
          ).join('\n')
        : null,
      markets ? marketLine(markets) : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
