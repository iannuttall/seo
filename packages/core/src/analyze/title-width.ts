export const SERP_TITLE_REFERENCE_WIDTH_PX = 580
export const SERP_TITLE_WIDTH_PROFILE = {
  id: 'arial-20-v1',
  fontFamily: 'Arial',
  fontSizePixels: 20,
  fontWeight: 400,
} as const

export type TitleWidthEstimate = {
  estimatedPixels: number
  referencePixels: number
  status: 'within-reference' | 'near-reference' | 'over-reference'
  confidence: 'high' | 'medium' | 'low'
  profile: typeof SERP_TITLE_WIDTH_PROFILE
  graphemeCount: number
  fallbackGraphemes: string[]
}

// Independently measured Arial 20px regular glyph advances, rounded to 0.1px.
const WIDTH_GROUPS: ReadonlyArray<readonly [string, number]> = [
  ["'", 3.8],
  ['ijl', 4.4],
  ['|', 5.2],
  [' !,;:./\\[]ftI', 5.6],
  ['-(){}\u0060r', 6.7],
  ['"', 7.1],
  ['*', 7.8],
  ['^', 9.4],
  ['cJksvxyz', 10],
  ['?_#$0123456789abdeghnopquL', 11.1],
  ['+<=>~', 11.7],
  ['FTZ', 12.2],
  ['&ABEKPRSVXY', 13.3],
  ['CDHNUw', 14.4],
  ['GOQ', 15.6],
  ['mM', 16.7],
  ['%', 17.8],
  ['W', 18.9],
  ['@', 20.3],
]

const ASCII_WIDTHS = new Map(
  WIDTH_GROUPS.flatMap(([characters, width]) =>
    [...characters].map((character) => [character, width] as const),
  ),
)

const COMMON_UNICODE_WIDTHS = new Map<string, number>([
  ['\u00a0', 5.6],
  ['‘', 4.4],
  ['’', 4.4],
  ['“', 7.1],
  ['”', 7.1],
  ['–', 11.1],
  ['\u2014', 20],
  ['…', 16.7],
  ['•', 7],
])

const KERNING_ADJUSTMENTS = new Map<string, number>([
  ['AV', -1.5],
  ['VA', -1.5],
  ['AW', -0.7],
  ['WA', -0.7],
  ['To', -2.2],
  ['Ta', -2.2],
  ['Te', -2.2],
  ['Ty', -1.1],
  ['Yo', -1.8],
  ['LT', -1.5],
  ['FA', -1.1],
  ['PA', -1.5],
  ['We', -0.4],
])

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })

function lowerConfidence(
  current: TitleWidthEstimate['confidence'],
  next: TitleWidthEstimate['confidence'],
): TitleWidthEstimate['confidence'] {
  const order = { high: 0, medium: 1, low: 2 } as const
  return order[next] > order[current] ? next : current
}

function graphemeWidth(grapheme: string): {
  confidence: TitleWidthEstimate['confidence']
  kerningCharacter?: string
  width: number
} {
  const direct = ASCII_WIDTHS.get(grapheme)
  if (direct !== undefined) {
    return { confidence: 'high', kerningCharacter: grapheme, width: direct }
  }

  const commonUnicode = COMMON_UNICODE_WIDTHS.get(grapheme)
  if (commonUnicode !== undefined) {
    return { confidence: 'high', width: commonUnicode }
  }

  if (/^[\p{Mark}\p{Format}]+$/u.test(grapheme)) {
    return { confidence: 'high', width: 0 }
  }

  const decomposed = grapheme.normalize('NFD')
  const base = [...decomposed].find((character) => !/\p{Mark}/u.test(character))
  const latinWidth = base ? ASCII_WIDTHS.get(base) : undefined
  if (
    latinWidth !== undefined &&
    /^\p{Script=Latin}\p{Mark}*$/u.test(decomposed)
  ) {
    return { confidence: 'high', kerningCharacter: base, width: latinWidth }
  }

  if (
    /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\u20e3/u.test(
      grapheme,
    )
  ) {
    return { confidence: 'medium', width: 23 }
  }
  if (
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Mark}]+$/u.test(
      grapheme,
    )
  ) {
    return { confidence: 'medium', width: 20 }
  }
  if (/^\p{Script=Latin}\p{Mark}*$/u.test(decomposed)) {
    return { confidence: 'medium', width: 11.1 }
  }

  return { confidence: 'low', width: 11.1 }
}

export function estimateSerpTitleWidth(title: string): TitleWidthEstimate {
  const normalized = title.trim().replace(/\s+/gu, ' ')
  const graphemes = [...segmenter.segment(normalized)].map(
    (segment) => segment.segment,
  )
  const fallbackGraphemes: string[] = []
  let confidence: TitleWidthEstimate['confidence'] = 'high'
  let previousKerningCharacter: string | undefined
  let width = 0

  for (const grapheme of graphemes) {
    const measured = graphemeWidth(grapheme)
    confidence = lowerConfidence(confidence, measured.confidence)
    if (
      measured.confidence === 'low' &&
      !fallbackGraphemes.includes(grapheme)
    ) {
      fallbackGraphemes.push(grapheme)
    }
    if (previousKerningCharacter && measured.kerningCharacter) {
      width +=
        KERNING_ADJUSTMENTS.get(
          `${previousKerningCharacter}${measured.kerningCharacter}`,
        ) ?? 0
    }
    width += measured.width
    previousKerningCharacter = measured.kerningCharacter
  }

  const estimatedPixels = Math.round(width * 10) / 10
  return {
    estimatedPixels,
    referencePixels: SERP_TITLE_REFERENCE_WIDTH_PX,
    status:
      estimatedPixels > SERP_TITLE_REFERENCE_WIDTH_PX
        ? 'over-reference'
        : estimatedPixels >= SERP_TITLE_REFERENCE_WIDTH_PX - 30
          ? 'near-reference'
          : 'within-reference',
    confidence,
    profile: SERP_TITLE_WIDTH_PROFILE,
    graphemeCount: graphemes.length,
    fallbackGraphemes: fallbackGraphemes.slice(0, 10),
  }
}
