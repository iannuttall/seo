import type { CreditUsage } from '../types.js'

export class SessionLedger {
  private readonly entries = new Map<string, CreditUsage>()
  private gscCalls = 0
  private gscRows = 0

  addUsage(usage: CreditUsage): void {
    const current = this.entries.get(usage.provider)
    if (!current) {
      this.entries.set(usage.provider, { ...usage })
      return
    }

    current.units += usage.units
    current.calls += usage.calls
    current.cacheHits = (current.cacheHits ?? 0) + (usage.cacheHits ?? 0)
    current.estimatedUsd =
      (current.estimatedUsd ?? 0) + (usage.estimatedUsd ?? 0)
  }

  addGsc(calls: number, rows: number): void {
    this.gscCalls += calls
    this.gscRows += rows
  }

  summary(): string {
    const providerBits = [...this.entries.values()].map((entry) => {
      const money = entry.estimatedUsd
        ? ` (~$${entry.estimatedUsd.toFixed(2)})`
        : ''
      const cacheHits = entry.cacheHits
        ? ` · Cache hits: ${entry.cacheHits}`
        : ''
      return `${entry.provider}: ${entry.calls} calls, ${entry.units} ${entry.unitLabel}${money}${cacheHits}`
    })

    providerBits.push(`GSC: ${this.gscCalls} calls, ${this.gscRows} rows`)
    return providerBits.join(' · ')
  }
}
