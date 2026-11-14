import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { table } from './present.js'
import { earlierRange } from './shared.js'
import type { DateRange, PageFacts } from './types.js'

// Most image search page rows read per period.
const ROWS = 5000

// Pages that show in Google Images, most image impressions first, beside
// the previous period and the site's web search totals.
export async function imageSearchReport(
  site: string,
  range: DateRange,
  read: SearchAnalyticsQuery,
): Promise<Record<string, unknown>> {
  const before = earlierRange(range)
  const get = (
    type: 'web' | 'image',
    window: DateRange,
    dimensions: string[],
  ) =>
    read(site, {
      ...window,
      dimensions,
      type,
      dataState: 'final',
      maxRows: dimensions.length ? ROWS : 1,
    })
  const [now, then, image, web] = await Promise.all([
    get('image', range, ['page']),
    get('image', before, ['page']),
    get('image', range, []),
    get('web', range, []),
  ])
  const earlier = new Map(then.rows.map((row) => [row.keys[0], row]))
  const items = now.rows
    .map((row) => ({
      page: row.keys[0],
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: Math.round(row.ctr * 10000) / 10000,
      position: Math.round(row.position * 10) / 10,
      previousImpressions: earlier.get(row.keys[0])?.impressions ?? 0,
      previousClicks: earlier.get(row.keys[0])?.clicks ?? 0,
    }))
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        b.clicks - a.clicks ||
        String(a.page).localeCompare(String(b.page)),
    )
  const total = image.rows[0] ?? { impressions: 0, clicks: 0 }
  const webImpressions = web.rows[0]?.impressions ?? 0
  const share = webImpressions
    ? Math.round((total.impressions / webImpressions) * 100)
    : null
  return {
    range,
    verdict: total.impressions
      ? `Google Images showed the site ${total.impressions} times and sent ${total.clicks} clicks${share === null ? '' : `, ${share < 1 ? 'under 1' : share}% as many impressions as web search`}. ${items.length}${now.rowsFetched >= ROWS ? '+' : ''} pages have image impressions.`
      : 'No image search impressions recorded in these dates.',
    summary: {
      impressions: total.impressions,
      clicks: total.clicks,
      webImpressions,
      pages: items.length,
      pagesCapped: now.rowsFetched >= ROWS,
    },
    items,
  }
}

// The live image checks, as a table and one line on what they found.
export function imageChecksText(
  checked: PageFacts[],
  origin: string | null,
): string {
  const read = checked.filter((page) => page.images)
  if (!read.length) {
    return 'Live image checks: no page could be read as HTML.'
  }
  const sum = (
    key: 'img' | 'no_alt' | 'empty_alt' | 'generic_names' | 'css_backgrounds',
  ) => read.reduce((total, page) => total + (page.images?.[key] ?? 0), 0)
  const noOg = read.filter((page) => !page.images?.og_image).length
  const noImg = read.filter((page) => !page.images?.img).length
  const capped = read.some((page) => page.images?.capped)
  const rows = read.map((page) => ({
    url: page.url,
    status: page.status,
    img: page.images?.img,
    no_alt: page.images?.no_alt,
    empty_alt: page.images?.empty_alt,
    generic_names: page.images?.generic_names,
    examples: page.images?.generic_examples.join(', '),
    css_backgrounds: page.images?.css_backgrounds,
    og_image: page.images?.og_image ? 'yes' : 'no',
  }))
  return [
    `Live image checks on the top ${read.length} pages, from the HTML as served (images added by scripts are not counted${capped ? '; some pages were cut off at the read limit, so their counts are floors' : ''}): ${sum('img')} <img> elements, ${sum('no_alt')} with no alt attribute, ${sum('empty_alt')} with empty alt text (right for decorative images only), ${sum('generic_names')} with file names that say nothing about the image (a heuristic, such as IMG_0023 or a long hash), ${sum('css_backgrounds')} background images set in a style attribute, where Google’s image guide asks for <img> elements instead, and ${noOg} ${noOg === 1 ? 'page' : 'pages'} with no og:image.`,
    noImg
      ? `${noImg} of these pages have no <img> element in their HTML, so the image Google Images shows for them may be their og:image or one added by a script: search Google Images for the page to see which.`
      : null,
    table(
      rows,
      [
        'url',
        'status',
        'img',
        'no_alt',
        'empty_alt',
        'generic_names',
        'examples',
        'css_backgrounds',
        'og_image',
      ],
      origin,
    ),
    'How to use this: show the person the pages they care about most first. Google’s image guide calls alt text the most important image metadata, so images on the top pages that show content but have no alt text or empty alt text come first, then descriptive file names, then og:image naming the image that represents the page. Run this section again in 4 to 8 weeks to see whether image clicks moved.',
  ]
    .filter(Boolean)
    .join('\n')
}
