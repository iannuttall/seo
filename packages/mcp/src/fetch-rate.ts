export function fetchRateInput(input: {
  fetchConcurrency?: number
  fetchIntervalCap?: number
  fetchIntervalMs?: number
}) {
  if (
    input.fetchConcurrency === undefined &&
    input.fetchIntervalCap === undefined &&
    input.fetchIntervalMs === undefined
  ) {
    return undefined
  }
  return {
    concurrency: input.fetchConcurrency,
    intervalCap: input.fetchIntervalCap,
    intervalMs: input.fetchIntervalMs,
  }
}
