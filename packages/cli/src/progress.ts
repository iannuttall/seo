import type { ProgressReporter } from '@seo/core'

export function createProgressReporter(
  enabled: boolean,
): ProgressReporter | undefined {
  if (!enabled) return undefined
  const startedAt = Date.now()
  return (message) => {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    process.stderr.write(`[seo ${elapsed}s] ${message}\n`)
  }
}
