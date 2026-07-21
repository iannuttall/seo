import type { DataForSeoPaidResponse } from './paid-request.js'

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

export function dataForSeoResponseCostMicros(
  response: DataForSeoPaidResponse,
): number | null {
  if (response.cost !== undefined) {
    return dataForSeoUsdToMicros(response.cost)
  }
  if (response.tasks.some((task) => task.cost === undefined)) return null
  return response.tasks.reduce(
    (sum, task) => sum + (dataForSeoUsdToMicros(task.cost) ?? 0),
    0,
  )
}
