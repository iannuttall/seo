// Google update dates and the traffic-drop check, for the seoskill.dev
// update checker. Browser-safe: no Node built-ins and no network calls.

export {
  analyzeTrafficAnomalyRows,
  changeWindow,
  type TrafficAnomaly,
} from '../analyze/traffic-anomaly-analysis.js'
export {
  RANKING_HISTORY,
  RANKING_HISTORY_CHECKED,
} from './ranking-history.js'
export {
  findOverlappingSearchUpdates,
  type SearchStatusIncident,
  type SearchUpdate,
  searchUpdatesFromIncidents,
  UPDATE_PADDING_DAYS,
  withRankingHistory,
} from './search-updates.js'
