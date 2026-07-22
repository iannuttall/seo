import type {
  AiPromptEvidence,
  AiPromptObservation,
  ProviderCostEvidence,
  ProviderId,
} from '../../providers/contracts.js'
import type { FirstPartyContext, TargetObservation } from './analysis.js'
import type { AiPromptModelInput } from './validation.js'

export type ObservationComparison = {
  status:
    | 'no-prior'
    | 'cached-observation'
    | 'model-changed'
    | 'incomplete-evidence'
    | 'comparable'
  previousCheckedAt: string | null
  previousEffectiveModel: string | null
  answerChanged: boolean | null
  citationDomainsAdded: string[]
  citationDomainsRemoved: string[]
  targetChanges: Array<{
    key: string
    label: string
    change:
      | 'appeared'
      | 'disappeared'
      | 'unchanged-observed'
      | 'unchanged-not-observed'
  }>
  detail: string
}

export type CompletedObservation = {
  state: 'complete'
  observationKey: string
  promptId: string
  promptGroup: string | null
  prompt: string
  surface: AiPromptModelInput['surface']
  fanOutQueries: Array<{
    query: string
    firstParty: FirstPartyContext
  }>
  targets: TargetObservation[]
  comparison: ObservationComparison
  evidence: AiPromptEvidence<AiPromptObservation>
}

export type FailedObservation = {
  state: 'unavailable'
  observationKey: string
  promptId: string
  promptGroup: string | null
  prompt: string
  surface: AiPromptModelInput['surface']
  requestedModel: string
  error: { code: string; message: string }
}

export type FanOutTheme = {
  term: string
  observationCount: number
  surfaces: AiPromptModelInput['surface'][]
  examples: string[]
  firstParty: FirstPartyContext
  method: 'bounded_fan_out_term_overlap_v1'
}

export type AiPromptObservationsReport = {
  schemaVersion: 1
  methodology: 'fixed_ai_prompt_observations_v1'
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  market: { countryCode: string; languageCode: string }
  configuration: {
    prompts: number
    models: number
    requestedObservations: number
    webSearch: boolean
    maxOutputTokens: number
    provider: ProviderId
    refresh: boolean
  }
  summary: {
    completed: number
    unavailable: number
    cached: number
    comparable: number
    targetObserved: number
    targetCited: number
    competitorOnly: number
    verdict: string
  }
  source: {
    firstParty: {
      requested: boolean
      status: 'not-requested' | 'complete' | 'empty' | 'partial' | 'unavailable'
      site: string | null
      range: { startDate: string; endDate: string } | null
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
      error: { code: string; message: string } | null
    }
  }
  processing: {
    firstPartyRows: number
    firstPartyTermVisits: number
    retainedFirstPartyPostings: number
    firstPartyCandidateVisits: number
  }
  observations: Array<CompletedObservation | FailedObservation>
  citedDomains: Array<{
    domain: string
    observationCount: number
    surfaces: AiPromptModelInput['surface'][]
    targetKeys: string[]
  }>
  fanOutThemes: FanOutTheme[]
  cost: ProviderCostEvidence & {
    estimateBasis: 'provider-base-fees-only'
    actualCostState: 'complete' | 'partial-or-unknown'
  }
  findings: Array<{
    code:
      | 'target-appeared'
      | 'target-disappeared'
      | 'target-not-observed'
      | 'competitor-only-observed'
      | 'owned-citation-observed'
      | 'first-party-fan-out-overlap'
      | 'repeated-fan-out-theme'
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  warnings: string[]
  caveats: string[]
  nextSteps: string[]
}
