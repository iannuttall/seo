import type { Recommendation } from '../../types.js'
import type { QueryContentCoverage } from '../content-coverage.js'
import type { PageTemplate, TemplateSummary } from '../page-patterns.js'

export type CannibalSuppressionReason =
  | 'brand_query'
  | 'quoted_boilerplate'
  | 'local_or_entity_intent'
  | 'template_overlap'

export interface CannibalSuppression {
  query: string
  reason: CannibalSuppressionReason
  urlCount: number
  template?: PageTemplate
  evidenceRef: string
}

export interface CannibalItem {
  query: string
  pages: Array<{
    url: string
    clicks: number
    impressions: number
    position: number
    template: PageTemplate
  }>
  hhi: number
  ownerUrl: string
  template?: PageTemplate
  recommendation: Recommendation
}

export interface DecayItem {
  query: string
  url: string
  template: PageTemplate
  clickLoss: number
  dropPct: number
  current: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  previous: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  diagnosis:
    | 'lost_visibility'
    | 'lost_position'
    | 'lost_ctr'
    | 'lost_impressions'
  recommendation: Recommendation
}

export interface DecayGroup {
  id: string
  label: string
  diagnosis: DecayItem['diagnosis']
  template: PageTemplate
  count: number
  totalClickLoss: number
  totalPreviousClicks: number
  averageDropPct: number
  sampleQueries: string[]
  sampleUrls: string[]
  recommendation: string
}

export interface QuickWinItem {
  query: string
  url: string
  template: PageTemplate
  position: number
  impressions: number
  ctr: number
  expectedCtrAt3: number
  estimatedClickLift: number
  contentVerification?: QueryContentCoverage
  recommendation: Recommendation
}

export interface QuickWinGroup {
  id: string
  label: string
  query: string
  template: PageTemplate
  count: number
  totalEstimatedClickLift: number
  totalImpressions: number
  sampleUrls: string[]
  recommendation: string
}

export interface TemplateAwareReport {
  templates: TemplateSummary[]
}
