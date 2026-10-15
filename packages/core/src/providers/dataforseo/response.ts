export function dataForSeoUsdToMicros(
  value: number | undefined,
): number | null {
  if (value === undefined) return null
  return Math.round(value * 1_000_000)
}

export function dataForSeoTaskErrorCode(
  statusCode: number,
): 'authentication' | 'rate-limit' | 'remote-error' {
  if (statusCode >= 40100 && statusCode < 40200) return 'authentication'
  if (statusCode === 40202) return 'rate-limit'
  return 'remote-error'
}
