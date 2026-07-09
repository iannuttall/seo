import type { Recommendation } from '../../types.js'
import type { PageTemplate, TemplateSummary } from '../page-patterns.js'

export type {
  CannibalItem,
  CannibalPage,
  CannibalReport,
  CannibalSelection,
  CannibalSuppression,
  CannibalSuppressionReason,
} from './cannibal-types.js'
export type {
  QuickWinGroup,
  QuickWinItem,
  QuickWinTemplateRecommendation,
} from './quick-wins-types.js'

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

export interface TemplateAwareReport {
  templates: TemplateSummary[]
}
