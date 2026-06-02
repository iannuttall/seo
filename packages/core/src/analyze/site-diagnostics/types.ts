import type { Recommendation } from '../../types.js'
import type { QueryContentCoverage } from '../content-coverage.js'

export interface CannibalItem {
  query: string
  pages: Array<{ url: string; impressions: number; position: number }>
  hhi: number
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
  position: number
  impressions: number
  ctr: number
  expectedCtrAt3: number
  estimatedClickLift: number
  contentVerification?: QueryContentCoverage
  recommendation: Recommendation
}
