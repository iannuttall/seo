// How wide a title or description shows in a Google result. Shared by
// `seo lint` and the seoskill.dev SERP preview. No DOM and no Node
// built-ins, so it runs in browsers, Workers and Node.

export type SerpDevice = 'desktop' | 'mobile'
export type SerpTextKind = 'title' | 'description'

// About how many pixels of each shows in full before Google cuts it off.
export const SERP_PIXEL_BUDGETS = {
  title: { desktop: 600, mobile: 560 },
  description: { desktop: 920, mobile: 680 },
} as const

// The font size of each in a desktop result, in Arial.
const FONT_PX: Record<SerpTextKind, number> = { title: 20, description: 14 }

export type MeasureText = (value: string) => number

export type SerpWidthStatus = {
  characters: number
  pixels: number
  budget: number
  status: 'empty' | 'fits' | 'may-truncate'
}

export function serpWidthStatus(
  value: string,
  device: SerpDevice,
  kind: SerpTextKind,
  measure: MeasureText,
): SerpWidthStatus {
  const budget = SERP_PIXEL_BUDGETS[kind][device]
  const pixels = Math.ceil(measure(value))
  return {
    characters: [...value].length,
    pixels,
    budget,
    status:
      value.length === 0 ? 'empty' : pixels <= budget ? 'fits' : 'may-truncate',
  }
}

// Arial advance widths per 1000 units of the font size, for printable
// ASCII from the space (32) to the tilde (126). Arial shares Helvetica's
// widths; these are from Helvetica's Adobe font metrics.
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
]
// Common punctuation outside ASCII, from the same metrics.
const OTHER: Record<string, number> = {
  '\u2018': 222,
  '\u2019': 222,
  '\u201c': 333,
  '\u201d': 333,
  '\u2013': 556,
  '\u2014': 1000,
  '\u2026': 1000,
  '\u2022': 350,
  '\u00b7': 278,
  '\u00a9': 737,
  '\u00ae': 737,
  '\u2122': 1000,
  '\u00a3': 556,
  '\u20ac': 556,
  '\u00b0': 400,
  '\u00d7': 584,
}
// Full-width scripts take a whole em; anything else unknown takes the
// width of a lowercase letter.
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const AVERAGE = 556

function units(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code >= 32 && code <= 126) return ASCII[code - 32] ?? AVERAGE
  const known = OTHER[char]
  if (known !== undefined) return known
  if (WIDE.test(char)) return 1000
  // An accented letter is as wide as the letter without its accent.
  const base = char.normalize('NFD').codePointAt(0) ?? 0
  if (base >= 32 && base <= 126) return ASCII[base - 32] ?? AVERAGE
  return AVERAGE
}

// An estimate of the text's width in pixels as a Google result draws it,
// from Arial's widths. A browser that has Arial measures it exactly; this
// is for places with no fonts, such as `seo lint`.
export function serpTextWidth(value: string, kind: SerpTextKind): number {
  let total = 0
  for (const char of value) total += units(char)
  return (total * FONT_PX[kind]) / 1000
}
