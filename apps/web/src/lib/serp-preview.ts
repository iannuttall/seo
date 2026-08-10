export const SERP_PREVIEW_LIMITS = {
  titleCharacters: 300,
  descriptionCharacters: 1_000,
  urlCharacters: 2_048,
  queryCharacters: 120,
  titlePixels: { desktop: 600, mobile: 560 },
  descriptionPixels: { desktop: 920, mobile: 680 },
} as const

export const SERP_PREVIEW_DEVICES = [
  { value: 'desktop', label: 'Desktop result' },
  { value: 'mobile', label: 'Mobile result' },
] as const

type SerpPreviewAdditionDefinition = {
  value: string
  label: string
  date?: string
  image?: boolean
  rating?: string
  product?: string
}

export const SERP_PREVIEW_ADDITIONS = [
  { value: 'none', label: 'Standard result' },
  { value: 'date', label: 'Result with date', date: 'Aug 10, 2026' },
  { value: 'image', label: 'Result with image', image: true },
  {
    value: 'date-image',
    label: 'Result with date and image',
    date: 'Aug 10, 2026',
    image: true,
  },
  {
    value: 'rating',
    label: 'Review rating example',
    rating: '4.7 · 84 reviews',
  },
  {
    value: 'product',
    label: 'Product details example',
    product: 'In stock · £25.00',
  },
] as const satisfies readonly SerpPreviewAdditionDefinition[]

export const SERP_GOOGLE_TABS = [
  'All',
  'Images',
  'Videos',
  'Shopping',
  'News',
] as const

export type SerpDevice = (typeof SERP_PREVIEW_DEVICES)[number]['value']
export type SerpAddition = (typeof SERP_PREVIEW_ADDITIONS)[number]['value']

export type SerpPreviewInput = {
  siteName: string
  url: string
  title: string
  description: string
  query: string
  device: SerpDevice
  addition: SerpAddition
}

export type SerpWidthStatus = {
  characters: number
  pixels: number
  budget: number
  status: 'empty' | 'fits' | 'may-truncate'
}

export type MeasureText = (value: string) => number

function bounded(value: string, limit: number): string {
  return value.slice(0, limit)
}

export function serpWidthStatus(
  value: string,
  device: SerpDevice,
  kind: 'title' | 'description',
  measure: MeasureText,
): SerpWidthStatus {
  const budget =
    kind === 'title'
      ? SERP_PREVIEW_LIMITS.titlePixels[device]
      : SERP_PREVIEW_LIMITS.descriptionPixels[device]
  const pixels = Math.ceil(measure(value))
  return {
    characters: [...value].length,
    pixels,
    budget,
    status:
      value.length === 0 ? 'empty' : pixels <= budget ? 'fits' : 'may-truncate',
  }
}

export function truncateSerpText(
  value: string,
  budget: number,
  measure: MeasureText,
): string {
  if (measure(value) <= budget) return value
  const ellipsis = '...'
  const segments = [...value]
  let low = 0
  let high = segments.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = `${segments.slice(0, middle).join('').trimEnd()}${ellipsis}`
    if (measure(candidate) <= budget) low = middle
    else high = middle - 1
  }
  return `${segments.slice(0, low).join('').trimEnd()}${ellipsis}`
}

export function serpDisplayUrl(raw: string): {
  site: string
  breadcrumb: string
} {
  try {
    const url = new URL(bounded(raw.trim(), SERP_PREVIEW_LIMITS.urlCharacters))
    const path = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 4)
      .map((part) => decodeURIComponent(part).replaceAll('-', ' '))
      .join(' › ')
    return {
      site: url.hostname.replace(/^www\./u, ''),
      breadcrumb: path,
    }
  } catch {
    return { site: 'example.com', breadcrumb: 'page' }
  }
}

export function serpQueryTerms(raw: string): string[] {
  return Array.from(
    new Set(
      bounded(raw, SERP_PREVIEW_LIMITS.queryCharacters)
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/gu)
        .filter((term) => term.length > 1),
    ),
  ).slice(0, 12)
}

function attribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function generateSerpMetaHtml(input: SerpPreviewInput): string {
  const title = bounded(input.title.trim(), SERP_PREVIEW_LIMITS.titleCharacters)
  const description = bounded(
    input.description.trim(),
    SERP_PREVIEW_LIMITS.descriptionCharacters,
  )
  return `<title>${title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</title>\n<meta name="description" content="${attribute(description)}">\n`
}
