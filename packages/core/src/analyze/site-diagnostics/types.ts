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
  diagnosis: 'lost_position' | 'lost_ctr' | 'lost_impressions'
  recommendation: Recommendation
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

export interface TemplateAwareReport {
  templates: TemplateSummary[]
}
