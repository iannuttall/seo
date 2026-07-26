import type {
  PseoPatternCoveragePolicy,
  PseoPatternKind,
  PseoPatternShape,
  PseoPatternValue,
} from '../pseo-pattern-contract.js'
import type {
  NormalizedMatrixPatternSet,
  NormalizedPairPatternSet,
  NormalizedPseoPatternSet,
  NormalizedTermPatternSet,
} from './input.js'

export type GeneratedPseoPatternCandidate = {
  id: string
  patternSetId: string
  kind: PseoPatternKind
  shape: PseoPatternShape
  coveragePolicy: PseoPatternCoveragePolicy
  variables: Record<string, PseoPatternValue>
  suggestedPath: string | null
  inventoryPaths: string[]
  queries: string[]
}

export type GeneratedPseoPatternSet = {
  id: string
  kind: PseoPatternKind
  shape: PseoPatternShape
  coveragePolicy: PseoPatternCoveragePolicy
  plannedTopics: number
  returnedTopics: number
  omittedTopics: number
  plannedQueryVariants: number
  returnedQueryVariants: number
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function replacePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template
    .replace(/\{([a-z][a-z0-9-]{0,39})\}/gu, (_match, name: string) => {
      return values[name] ?? ''
    })
    .replace(/\s+/gu, ' ')
    .trim()
}

function candidateForVariables(
  set: NormalizedPseoPatternSet,
  variables: Record<string, PseoPatternValue>,
): GeneratedPseoPatternCandidate {
  const entries = Object.entries(variables).sort(([left], [right]) =>
    compareCodepoints(left, right),
  )
  const labels = Object.fromEntries(
    entries.map(([name, value]) => [name, value.label]),
  )
  const ids = Object.fromEntries(
    entries.map(([name, value]) => [name, value.id]),
  )
  const queries = [
    ...new Set(
      set.queryTemplates.map((template) =>
        replacePlaceholders(template, labels),
      ),
    ),
  ].sort(compareCodepoints)
  const renderPath = (pathValues: Record<string, string>) =>
    set.pathTemplate
      ? replacePlaceholders(set.pathTemplate, pathValues)
          .replace(/\/+/gu, '/')
          .replace(/\/$/u, '') || '/'
      : null
  const suggestedPath = renderPath(ids)
  const inventoryPaths = suggestedPath ? [suggestedPath] : []
  if (set.kind === 'comparison' && set.shape === 'pairs' && suggestedPath) {
    const reversedPath = renderPath({
      ...ids,
      left: ids.right as string,
      right: ids.left as string,
    })
    if (reversedPath && !inventoryPaths.includes(reversedPath)) {
      inventoryPaths.push(reversedPath)
    }
  }
  return {
    id: `${set.id}:${entries.map(([name, value]) => `${name}=${value.id}`).join(',')}`,
    patternSetId: set.id,
    kind: set.kind,
    shape: set.shape,
    coveragePolicy: set.coveragePolicy,
    variables: Object.fromEntries(entries),
    suggestedPath,
    inventoryPaths: inventoryPaths.sort(compareCodepoints),
    queries,
  }
}

function* termCandidates(
  set: NormalizedTermPatternSet,
): Generator<GeneratedPseoPatternCandidate> {
  for (const value of set.values) {
    yield candidateForVariables(set, { value })
  }
}

function pairValues(set: NormalizedPairPatternSet): Array<{
  left: PseoPatternValue
  right: PseoPatternValue
}> {
  const byId = new Map(set.values.map((value) => [value.id, value]))
  if (set.pairing === 'anchor') {
    const left = byId.get(set.anchor as string)
    if (!left) return []
    return set.values
      .filter((value) => value.id !== left.id)
      .map((right) => ({ left, right }))
  }
  if (set.pairing === 'explicit') {
    return set.pairs.flatMap((pair) => {
      const left = byId.get(pair.left)
      const right = byId.get(pair.right)
      return left && right ? [{ left, right }] : []
    })
  }
  const pairs: Array<{ left: PseoPatternValue; right: PseoPatternValue }> = []
  for (let leftIndex = 0; leftIndex < set.values.length; leftIndex += 1) {
    const left = set.values[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < set.values.length;
      rightIndex += 1
    ) {
      const right = set.values[rightIndex]
      if (right) pairs.push({ left, right })
    }
  }
  return pairs
}

function* pairCandidates(
  set: NormalizedPairPatternSet,
): Generator<GeneratedPseoPatternCandidate> {
  for (const pair of pairValues(set)) {
    yield candidateForVariables(set, pair)
  }
}

function* matrixVariables(
  set: NormalizedMatrixPatternSet,
  axisIndex = 0,
  current: Record<string, PseoPatternValue> = {},
): Generator<Record<string, PseoPatternValue>> {
  const axis = set.axes[axisIndex]
  if (!axis) {
    yield { ...current }
    return
  }
  for (const value of axis.values) {
    current[axis.id] = value
    yield* matrixVariables(set, axisIndex + 1, current)
  }
  delete current[axis.id]
}

function* matrixCandidates(
  set: NormalizedMatrixPatternSet,
): Generator<GeneratedPseoPatternCandidate> {
  for (const variables of matrixVariables(set)) {
    yield candidateForVariables(set, variables)
  }
}

function candidateIterator(
  set: NormalizedPseoPatternSet,
): Generator<GeneratedPseoPatternCandidate> {
  if (set.shape === 'terms') return termCandidates(set)
  if (set.shape === 'pairs') return pairCandidates(set)
  return matrixCandidates(set)
}

export function plannedPseoPatternTopics(
  set: NormalizedPseoPatternSet,
): number {
  if (set.shape === 'terms') return set.values.length
  if (set.shape === 'pairs') {
    if (set.pairing === 'anchor') return Math.max(0, set.values.length - 1)
    if (set.pairing === 'explicit') return set.pairs.length
    return (set.values.length * (set.values.length - 1)) / 2
  }
  return set.axes.reduce((total, axis) => total * axis.values.length, 1)
}

export function generatePseoPatternCandidates(input: {
  sets: NormalizedPseoPatternSet[]
  limit: number
}): {
  candidates: GeneratedPseoPatternCandidate[]
  patternSets: GeneratedPseoPatternSet[]
} {
  const iterators = input.sets.map((set) => ({
    set,
    iterator: candidateIterator(set),
    returnedTopics: 0,
    returnedQueryVariants: 0,
    done: false,
  }))
  const candidates: GeneratedPseoPatternCandidate[] = []
  while (
    candidates.length < input.limit &&
    iterators.some((entry) => !entry.done)
  ) {
    for (const entry of iterators) {
      if (entry.done || candidates.length >= input.limit) continue
      const next = entry.iterator.next()
      if (next.done) {
        entry.done = true
        continue
      }
      candidates.push(next.value)
      entry.returnedTopics += 1
      entry.returnedQueryVariants += next.value.queries.length
    }
  }
  candidates.sort((left, right) => compareCodepoints(left.id, right.id))
  return {
    candidates,
    patternSets: iterators.map((entry) => {
      const plannedTopics = plannedPseoPatternTopics(entry.set)
      return {
        id: entry.set.id,
        kind: entry.set.kind,
        shape: entry.set.shape,
        coveragePolicy: entry.set.coveragePolicy,
        plannedTopics,
        returnedTopics: entry.returnedTopics,
        omittedTopics: Math.max(0, plannedTopics - entry.returnedTopics),
        plannedQueryVariants: plannedTopics * entry.set.queryTemplates.length,
        returnedQueryVariants: entry.returnedQueryVariants,
      }
    }),
  }
}
