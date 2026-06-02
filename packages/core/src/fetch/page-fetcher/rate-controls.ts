import PQueue from 'p-queue'
import type { FetchRateControls, NormalizedFetchRateControls } from './types.js'

const HOST_QUEUES = new Map<string, PQueue>()

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function normalizeRateControls(
  rate?: FetchRateControls,
): NormalizedFetchRateControls {
  return {
    concurrency: rate?.concurrency ?? numberEnv('SEO_FETCH_CONCURRENCY', 4),
    intervalCap: rate?.intervalCap ?? numberEnv('SEO_FETCH_INTERVAL_CAP', 4),
    intervalMs: rate?.intervalMs ?? numberEnv('SEO_FETCH_INTERVAL_MS', 1000),
  }
}

export function queueForHost(
  host: string,
  rate: NormalizedFetchRateControls,
): PQueue {
  const key = `${host}:${rate.concurrency}:${rate.intervalCap}:${rate.intervalMs}`
  const existing = HOST_QUEUES.get(key)
  if (existing) {
    return existing
  }

  const queue = new PQueue({
    concurrency: rate.concurrency,
    intervalCap: rate.intervalCap,
    interval: rate.intervalMs,
  })
  HOST_QUEUES.set(key, queue)
  return queue
}
