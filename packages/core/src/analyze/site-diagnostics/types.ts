import type { TemplateSummary } from '../page-patterns.js'

export type {
  CannibalItem,
  CannibalPage,
  CannibalReport,
  CannibalSelection,
  CannibalSuppression,
  CannibalSuppressionReason,
} from './cannibal-types.js'
export type {
  DecayAnalysis,
  DecayComparison,
  DecayDiagnosis,
  DecayGroup,
  DecayItem,
  DecayMetrics,
  DecaySelection,
  DecaySignal,
} from './decay-types.js'
export type {
  QuickWinGroup,
  QuickWinItem,
  QuickWinTemplateRecommendation,
} from './quick-wins-types.js'

export interface TemplateAwareReport {
  templates: TemplateSummary[]
}
