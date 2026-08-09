export const WORD_COMBINER_LIMITS = {
  lists: 5,
  itemsPerList: 5_000,
  charactersPerList: 100_000,
  candidateCombinations: 100_000,
  affixCharacters: 80,
  separatorCharacters: 12,
  filterCharacters: 2_000,
  filterTerms: 50,
} as const

export type WordCombinationCase =
  | 'preserve'
  | 'lowercase'
  | 'uppercase'
  | 'title-case'

export type WordCombinationPattern =
  | 'all-lists'
  | 'progressive'
  | 'adjacent-and-all'

export type WordCombinationAffixScope = 'item' | 'combination'

export type WordCombinationInput = {
  lists: string[]
  pattern: WordCombinationPattern
  includeIndividuals: boolean[]
  wordSeparator: string
  caseMode: WordCombinationCase
  prefix: string
  suffix: string
  affixScope: WordCombinationAffixScope
  dedupe: boolean
  include: string
  exclude: string
  candidateLimit?: number
}

export type WordCombinationProjection = {
  total: bigint
  populatedLists: number
  listCounts: number[]
  duplicateInputsRemoved: number
  inputTruncated: boolean
}

export type WordCombinationResult = {
  rows: string[]
  projectedCount: string
  processedCandidates: number
  populatedLists: number
  listCounts: number[]
  duplicateInputsRemoved: number
  inputTruncated: boolean
  capped: boolean
}

type NormalisedLists = Omit<WordCombinationProjection, 'total'> & {
  lists: Array<{ sourceIndex: number; values: string[] }>
}

function normaliseLists(rawLists: string[], dedupe: boolean): NormalisedLists {
  const lists: NormalisedLists['lists'] = []
  let duplicateInputsRemoved = 0
  let inputTruncated = rawLists.length > WORD_COMBINER_LIMITS.lists

  for (const [sourceIndex, rawList] of rawLists
    .slice(0, WORD_COMBINER_LIMITS.lists)
    .entries()) {
    const bounded = rawList.slice(0, WORD_COMBINER_LIMITS.charactersPerList)
    if (bounded.length < rawList.length) inputTruncated = true

    const values: string[] = []
    const seen = new Set<string>()
    for (const rawValue of bounded.split(/\r?\n/u)) {
      const value = rawValue.trim()
      if (!value) continue
      if (dedupe && seen.has(value)) {
        duplicateInputsRemoved += 1
        continue
      }
      seen.add(value)
      if (values.length >= WORD_COMBINER_LIMITS.itemsPerList) {
        inputTruncated = true
        continue
      }
      values.push(value)
    }
    if (values.length > 0) lists.push({ sourceIndex, values })
  }

  return {
    lists,
    populatedLists: lists.length,
    listCounts: lists.map((list) => list.values.length),
    duplicateInputsRemoved,
    inputTruncated,
  }
}

export function projectWordCombinationCount(
  rawLists: string[],
  dedupe = true,
  pattern: WordCombinationPattern = 'all-lists',
  includeIndividuals: boolean[] = [],
): WordCombinationProjection {
  const normalised = normaliseLists(rawLists, dedupe)
  const total = projectNormalisedCount(normalised, pattern, includeIndividuals)

  return {
    total,
    populatedLists: normalised.populatedLists,
    listCounts: normalised.listCounts,
    duplicateInputsRemoved: normalised.duplicateInputsRemoved,
    inputTruncated: normalised.inputTruncated,
  }
}

function selectedPatterns(
  listCount: number,
  pattern: WordCombinationPattern,
): number[][] {
  if (listCount < 2) return []
  const patterns: number[][] = []
  if (pattern === 'progressive') {
    for (let length = 2; length <= listCount; length += 1) {
      patterns.push(Array.from({ length }, (_, index) => index))
    }
  } else if (pattern === 'adjacent-and-all') {
    for (let start = 0; start < listCount - 1; start += 1) {
      patterns.push([start, start + 1])
    }
    patterns.push(Array.from({ length: listCount }, (_, index) => index))
  } else {
    patterns.push(Array.from({ length: listCount }, (_, index) => index))
  }

  const seen = new Set<string>()
  return patterns.filter((indexes) => {
    const key = indexes.join(',')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function projectNormalisedCount(
  normalised: NormalisedLists,
  pattern: WordCombinationPattern,
  includeIndividuals: boolean[],
): bigint {
  let total = 0n
  for (const indexes of selectedPatterns(normalised.lists.length, pattern)) {
    total += indexes.reduce(
      (product, index) =>
        product * BigInt(normalised.lists[index]?.values.length ?? 0),
      1n,
    )
  }
  for (const list of normalised.lists) {
    if (includeIndividuals[list.sourceIndex]) {
      total += BigInt(list.values.length)
    }
  }
  return total
}

function applyCase(value: string, mode: WordCombinationCase): string {
  if (mode === 'lowercase') return value.toLocaleLowerCase()
  if (mode === 'uppercase') return value.toLocaleUpperCase()
  if (mode === 'title-case') {
    return value
      .toLocaleLowerCase()
      .replace(
        /(^|[\s_-])(\p{L})/gu,
        (_, boundary: string, letter: string) =>
          `${boundary}${letter.toLocaleUpperCase()}`,
      )
  }
  return value
}

function filterTerms(value: string): string[] {
  return value
    .slice(0, WORD_COMBINER_LIMITS.filterCharacters)
    .split(/\r?\n/u)
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean)
    .slice(0, WORD_COMBINER_LIMITS.filterTerms)
}

export function generateWordCombinations(
  input: WordCombinationInput,
  onProgress?: (processedCandidates: number) => void,
): WordCombinationResult {
  const normalised = normaliseLists(input.lists, input.dedupe)
  const projected = projectNormalisedCount(
    normalised,
    input.pattern,
    input.includeIndividuals,
  )
  const candidateLimit = Math.max(
    1,
    Math.min(
      WORD_COMBINER_LIMITS.candidateCombinations,
      Math.floor(
        input.candidateLimit ?? WORD_COMBINER_LIMITS.candidateCombinations,
      ),
    ),
  )
  const wordSeparator = input.wordSeparator.slice(
    0,
    WORD_COMBINER_LIMITS.separatorCharacters,
  )
  const prefix = input.prefix.slice(0, WORD_COMBINER_LIMITS.affixCharacters)
  const suffix = input.suffix.slice(0, WORD_COMBINER_LIMITS.affixCharacters)
  const include = filterTerms(input.include)
  const exclude = filterTerms(input.exclude)
  const rows: string[] = []
  const seenRows = new Set<string>()
  let processedCandidates = 0

  function retain(parts: string[]): void {
    if (processedCandidates >= candidateLimit) return
    processedCandidates += 1
    const formattedParts = parts.map((part) => applyCase(part, input.caseMode))
    const combined =
      input.affixScope === 'item'
        ? formattedParts
            .map((part) => `${prefix}${part}${suffix}`)
            .join(wordSeparator)
        : `${prefix}${formattedParts.join(wordSeparator)}${suffix}`
    const comparable = combined.toLocaleLowerCase()
    const included =
      include.length === 0 || include.some((term) => comparable.includes(term))
    const excluded = exclude.some((term) => comparable.includes(term))
    if (included && !excluded && (!input.dedupe || !seenRows.has(combined))) {
      rows.push(combined)
      seenRows.add(combined)
    }
    if (processedCandidates % 5_000 === 0) onProgress?.(processedCandidates)
  }

  function visitPattern(
    indexes: number[],
    parts: string[],
    depth: number,
  ): void {
    if (processedCandidates >= candidateLimit) return
    if (depth === indexes.length) {
      retain(parts)
      return
    }
    const listIndex = indexes[depth]
    const list =
      listIndex === undefined ? undefined : normalised.lists[listIndex]
    if (!list) return
    for (const value of list.values) {
      if (processedCandidates >= candidateLimit) break
      parts[depth] = value
      visitPattern(indexes, parts, depth + 1)
    }
  }

  for (const list of normalised.lists) {
    if (!input.includeIndividuals[list.sourceIndex]) continue
    for (const value of list.values) {
      if (processedCandidates >= candidateLimit) break
      retain([value])
    }
  }
  for (const indexes of selectedPatterns(
    normalised.lists.length,
    input.pattern,
  )) {
    if (processedCandidates >= candidateLimit) break
    visitPattern(indexes, new Array<string>(indexes.length), 0)
  }
  onProgress?.(processedCandidates)

  return {
    rows,
    projectedCount: projected.toString(),
    processedCandidates,
    populatedLists: normalised.populatedLists,
    listCounts: normalised.listCounts,
    duplicateInputsRemoved: normalised.duplicateInputsRemoved,
    inputTruncated: normalised.inputTruncated,
    capped: projected > BigInt(processedCandidates),
  }
}

export function wordCombinationsToTxt(
  rows: string[],
  outputSeparator = '\n',
): string {
  if (rows.length === 0) return ''
  const joined = rows.join(outputSeparator)
  return outputSeparator === '\n' ? `${joined}\n` : joined
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export function wordCombinationsToCsv(rows: string[]): string {
  return `${['"combination"', ...rows.map(csvCell)].join('\r\n')}\r\n`
}
