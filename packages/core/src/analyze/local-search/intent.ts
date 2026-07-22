import type { LocalIntentEvidence } from './types.js'

const NEARBY_PHRASES = [
  'closest to me',
  'in my area',
  'near me',
  'nearby',
] as const
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/iu
const US_ZIP_CODE = /\b\d{5}(?:-\d{4})?\b/u
const US_ZIP_CONTEXT =
  /\b(?:around|near|nearby|postal(?:\s+code)?|zip(?:\s+code)?)\b/iu

export function normalizeLocalSearchText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

function tokens(value: string): string[] {
  return normalizeLocalSearchText(value).match(/[\p{L}\p{N}]+/gu) ?? []
}

function includesTokenSequence(source: string[], candidate: string[]): boolean {
  if (candidate.length === 0 || candidate.length > source.length) return false
  return source.some((_, start) =>
    candidate.every((token, offset) => source[start + offset] === token),
  )
}

type TermNode = {
  children: Map<string, TermNode>
  terms: string[]
}

function termMatcher(terms: string[]) {
  const root: TermNode = { children: new Map(), terms: [] }
  for (const term of terms) {
    let node = root
    for (const token of tokens(term)) {
      const child = node.children.get(token) ?? {
        children: new Map(),
        terms: [],
      }
      node.children.set(token, child)
      node = child
    }
    node.terms.push(term)
  }
  return (source: string[]): string[] => {
    const matches = new Set<string>()
    for (let start = 0; start < source.length; start++) {
      let node: TermNode | undefined = root
      for (let index = start; index < source.length; index++) {
        node = node.children.get(source[index] as string)
        if (!node) break
        for (const term of node.terms) matches.add(term)
      }
    }
    return [...matches].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    )
  }
}

export function normalizeLocationTerms(values: string[] = []): string[] {
  return [
    ...new Set(values.map(normalizeLocalSearchText).filter(Boolean)),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

export function classifyLocalIntent(
  query: string,
  locationTerms: string[],
): LocalIntentEvidence | null {
  return createLocalIntentClassifier(locationTerms)(query)
}

export function createLocalIntentClassifier(locationTerms: string[]) {
  const matchLocations = termMatcher(locationTerms)
  return (query: string): LocalIntentEvidence | null => {
    const normalized = normalizeLocalSearchText(query)
    const queryTokens = tokens(normalized)
    const matchedLocations = matchLocations(queryTokens)
    const matchedNearby = NEARBY_PHRASES.filter((phrase) =>
      includesTokenSequence(queryTokens, tokens(phrase)),
    )
    const ukPostcode = UK_POSTCODE.exec(query)?.[0] ?? null
    const usZipCode =
      US_ZIP_CONTEXT.test(query) && US_ZIP_CODE.test(query)
        ? (US_ZIP_CODE.exec(query)?.[0] ?? null)
        : null
    const postalCode = ukPostcode ?? usZipCode
    const classes: LocalIntentEvidence['classes'] = []
    if (matchedLocations.length > 0) classes.push('named-location')
    if (matchedNearby.length > 0) classes.push('nearby')
    if (postalCode) classes.push('postal-code')
    if (classes.length === 0) return null

    return {
      heuristic: true,
      method: 'explicit-local-intent-v1',
      classes,
      matchedTerms: [
        ...matchedLocations,
        ...matchedNearby,
        ...(postalCode ? [normalizeLocalSearchText(postalCode)] : []),
      ],
    }
  }
}
