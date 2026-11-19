import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { brandRegex, type ContextStore } from './context.js'
import { marketLine, savedMarketTotals } from './markets.js'
import { BRAND_DATA_FROM, isFolderProperty, rowTextFilters } from './rows.js'
import type { DateRange } from './types.js'

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
}

const MIN_CLICKS = 50
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
  return {
    google: status,
    names,
    current: now,
    previous: before,
    small: now.total.clicks < MIN_CLICKS,
    differ,
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
export function brandSplitLines(split: BrandSplit): string[] {
  const lines: string[] = []
  const { current: now, previous: then } = split
  if (now.names) {
    lines.push(
      `By your brand names (${split.names.join(', ')}): ${sideText(now.names, then.names)}. Counts only the searches Search Console shows.`,
    )
  }
  if (now.google) {
    lines.push(
      `By Google’s brand classification: ${sideText(now.google, then.google)}.${then.google ? '' : ` The earlier dates have no classification (it starts ${BRAND_DATA_FROM}), so there is no change to show.`}`,
    )
  } else if (split.google !== 'classified') {
    lines.push(GOOGLE_MISSING[split.google])
  }
  if (!now.names) {
    lines.push(
      'No brand names are saved in the business context ("## Brand names"), so there is no split by name.',
    )
  }
  if (split.differ) {
    lines.push(
      'The two ways differ a lot on brand clicks (a heuristic: more than 25%). A brand name may be missing, such as a product name or a misspelling, or one may also be a generic word.',
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
      split ? brandSplitLines(split).join('\n') : null,
      markets ? marketLine(markets) : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
