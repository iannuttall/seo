import type {
  AiPromptCitation,
  AiPromptSurface,
} from '../../providers/contracts.js'
import type { GscQueryAggregate } from '../domain-research/shared.js'
import {
  canonicalPseoTerm,
  pseoQueryThemeTerms,
} from '../pseo/query-insights.js'
import type { ValidatedAiPromptTarget } from './validation.js'

const MAX_POSTINGS_PER_TERM = 100
const MAX_RETAINED_POSTINGS = 50_000
const MAX_FIRST_PARTY_MATCHES = 3
const MAX_THEMES = 10

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function aliasPattern(alias: string): RegExp {
  const first = alias[0] ?? ''
  const last = alias.at(-1) ?? ''
  const leading = /^\w$/u.test(first) ? '\\b' : `(?<!${escaped(first)})`
  const trailing = /^\w$/u.test(last) ? '\\b' : `(?!${escaped(last)})`
  return new RegExp(`${leading}${escaped(alias)}${trailing}`, 'iu')
}

function matchesDomain(domain: string, target: string): boolean {
  return domain === target || domain.endsWith(`.${target}`)
}

export type TargetObservation = {
  key: string
  label: string
  role: 'target' | 'competitor'
  answerState: 'observed' | 'not-observed'
  matchedAliases: string[]
  citedDomains: string[]
}

export function targetObservations(
  answer: string,
  citations: AiPromptCitation[],
  targets: ValidatedAiPromptTarget[],
): TargetObservation[] {
  return targets.map((target) => {
    const matchedAliases = target.aliases
      .filter((alias) => aliasPattern(alias).test(answer))
      .sort(compareText)
    const citedDomains = [
      ...new Set(
        citations
          .filter((citation) =>
            target.domains.some((domain) =>
              matchesDomain(citation.domain, domain),
            ),
          )
          .map((citation) => citation.domain),
      ),
    ].sort(compareText)
    return {
      key: target.key,
      label: target.label,
      role: target.role,
      answerState:
        matchedAliases.length > 0
          ? ('observed' as const)
          : ('not-observed' as const),
      matchedAliases,
      citedDomains,
    }
  })
}

function terms(value: string): string[] {
  return [
    ...new Set(
      pseoQueryThemeTerms(value).map(canonicalPseoTerm).filter(Boolean),
    ),
  ].sort(compareText)
}

export type FirstPartyContext = {
  status: 'matched' | 'not-in-retained-rows' | 'not-requested'
  sharedTerms: string[]
  queries: GscQueryAggregate[]
}

export type FirstPartyMatcher = {
  match(query: string): FirstPartyContext
  processing: {
    rows: number
    termVisits: number
    retainedPostings: number
    candidateVisits: number
  }
}

export function createFirstPartyMatcher(
  rows: GscQueryAggregate[] | null,
): FirstPartyMatcher {
  if (!rows) {
    return {
      match: () => ({
        status: 'not-requested',
        sharedTerms: [],
        queries: [],
      }),
      processing: {
        rows: 0,
        termVisits: 0,
        retainedPostings: 0,
        candidateVisits: 0,
      },
    }
  }
  const index = new Map<string, number[]>()
  let termVisits = 0
  let retainedPostings = 0
  let candidateVisits = 0
  for (const [rowIndex, row] of rows.entries()) {
    for (const term of terms(row.query)) {
      termVisits += 1
      const postings = index.get(term) ?? []
      if (
        postings.length < MAX_POSTINGS_PER_TERM &&
        retainedPostings < MAX_RETAINED_POSTINGS
      ) {
        postings.push(rowIndex)
        retainedPostings += 1
        index.set(term, postings)
      }
    }
  }
  return {
    match(query) {
      const queryTerms = terms(query)
      const sharedTerms = queryTerms.filter((term) => index.has(term))
      const candidates = new Set<number>()
      for (const term of sharedTerms) {
        for (const rowIndex of index.get(term) ?? []) {
          candidateVisits += 1
          candidates.add(rowIndex)
        }
      }
      const matches = [...candidates]
        .flatMap((rowIndex) => {
          const row = rows[rowIndex]
          if (!row) return []
          const overlap = terms(row.query).filter((term) =>
            queryTerms.includes(term),
          ).length
          return overlap > 0 ? [{ row, overlap }] : []
        })
        .sort(
          (left, right) =>
            right.overlap - left.overlap ||
            right.row.impressions - left.row.impressions ||
            compareText(left.row.query, right.row.query),
        )
        .slice(0, MAX_FIRST_PARTY_MATCHES)
        .map((item) => item.row)
      return {
        status:
          matches.length > 0
            ? ('matched' as const)
            : ('not-in-retained-rows' as const),
        sharedTerms,
        queries: matches,
      }
    },
    processing: {
      rows: rows.length,
      termVisits,
      retainedPostings,
      get candidateVisits() {
        return candidateVisits
      },
    },
  }
}

export function fanOutThemes(
  observations: Array<{
    observationKey: string
    surface: AiPromptSurface
    fanOutQueries: string[]
  }>,
  firstParty: FirstPartyMatcher,
): Array<{
  term: string
  observationCount: number
  surfaces: AiPromptSurface[]
  examples: string[]
  firstParty: FirstPartyContext
  method: 'bounded_fan_out_term_overlap_v1'
}> {
  const grouped = new Map<
    string,
    {
      observations: Set<string>
      surfaces: Set<AiPromptSurface>
      examples: Set<string>
    }
  >()
  for (const observation of observations) {
    for (const query of observation.fanOutQueries) {
      for (const term of terms(query)) {
        const current = grouped.get(term) ?? {
          observations: new Set<string>(),
          surfaces: new Set<AiPromptSurface>(),
          examples: new Set<string>(),
        }
        current.observations.add(observation.observationKey)
        current.surfaces.add(observation.surface)
        current.examples.add(query)
        grouped.set(term, current)
      }
    }
  }
  return [...grouped.entries()]
    .filter(([, item]) => item.observations.size >= 2)
    .map(([term, item]) => ({
      term,
      observationCount: item.observations.size,
      surfaces: [...item.surfaces].sort(compareText),
      examples: [...item.examples].sort(compareText).slice(0, 3),
      firstParty: firstParty.match(term),
      method: 'bounded_fan_out_term_overlap_v1' as const,
    }))
    .sort(
      (left, right) =>
        right.observationCount - left.observationCount ||
        right.firstParty.queries.length - left.firstParty.queries.length ||
        compareText(left.term, right.term),
    )
    .slice(0, MAX_THEMES)
}
