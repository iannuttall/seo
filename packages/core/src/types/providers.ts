/** Calls and units one provider used during a report run. */
export interface CreditUsage {
  provider: string
  units: number
  unitLabel: string
  estimatedUsd?: number
  calls: number
  cacheHits?: number
}
