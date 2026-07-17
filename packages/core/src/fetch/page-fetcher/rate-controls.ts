import PQueue from 'p-queue'
import type { FetchRateControls, NormalizedFetchRateControls } from './types.js'

const HOST_QUEUES = new Map<string, PQueue>()
const HOST_HEALTH = new Map<string, HostHealth>()

export const MAX_FETCH_CONCURRENCY = 16

type BackpressureSnapshot = {
  host: string
  status: 'ok' | 'slowed' | 'stopped'
  reason?: string
  delayMs: number
  cooldownUntil?: string
  consecutiveSlow: number
  consecutiveBlocked: number
  consecutiveErrors: number
  recentP95Ms?: number
}

type HostHealth = {
  durations: number[]
  consecutiveSlow: number
  consecutiveBlocked: number
  consecutiveErrors: number
  cooldownUntil: number
  stoppedUntil: number
  reason?: string
  lastDelayMs: number
}

export class OriginBackpressureError extends Error {
  snapshot: BackpressureSnapshot

  constructor(snapshot: BackpressureSnapshot) {
    super(
      `Origin backpressure stopped fetches for ${snapshot.host}: ${snapshot.reason ?? 'cooldown active'}`,
    )
    this.name = 'OriginBackpressureError'
    this.snapshot = snapshot
  }
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function healthForHost(host: string): HostHealth {
  const existing = HOST_HEALTH.get(host)
  if (existing) return existing
  const health: HostHealth = {
    durations: [],
    consecutiveSlow: 0,
    consecutiveBlocked: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
    stoppedUntil: 0,
    lastDelayMs: 0,
  }
  HOST_HEALTH.set(host, health)
  return health
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)
  return sorted[index]
}

function snapshotForHost(
  host: string,
  status?: BackpressureSnapshot['status'],
) {
  const health = healthForHost(host)
  const recentP95Ms = percentile(health.durations, 0.95)
  const cooldown = Math.max(health.cooldownUntil, health.stoppedUntil)
  return {
    host,
    status:
      status ??
      (Date.now() < health.stoppedUntil
        ? 'stopped'
        : Date.now() < health.cooldownUntil
          ? 'slowed'
          : 'ok'),
    reason: health.reason,
    delayMs: health.lastDelayMs,
    cooldownUntil:
      cooldown > Date.now() ? new Date(cooldown).toISOString() : undefined,
    consecutiveSlow: health.consecutiveSlow,
    consecutiveBlocked: health.consecutiveBlocked,
    consecutiveErrors: health.consecutiveErrors,
    recentP95Ms,
  } satisfies BackpressureSnapshot
}

export function normalizeRateControls(
  rate?: FetchRateControls,
): NormalizedFetchRateControls {
  const concurrency = rate?.concurrency ?? numberEnv('SEO_FETCH_CONCURRENCY', 4)
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_FETCH_CONCURRENCY
  ) {
    throw new RangeError(
      `Fetch concurrency must be an integer from 1 to ${MAX_FETCH_CONCURRENCY}.`,
    )
  }
  return {
    concurrency,
    intervalCap: rate?.intervalCap ?? numberEnv('SEO_FETCH_INTERVAL_CAP', 4),
    intervalMs: rate?.intervalMs ?? numberEnv('SEO_FETCH_INTERVAL_MS', 1000),
    backpressure: {
      slowMs:
        rate?.backpressure?.slowMs ?? numberEnv('SEO_FETCH_SLOW_MS', 8_000),
      verySlowMs:
        rate?.backpressure?.verySlowMs ??
        numberEnv('SEO_FETCH_VERY_SLOW_MS', 15_000),
      maxConsecutiveSlow:
        rate?.backpressure?.maxConsecutiveSlow ??
        numberEnv('SEO_FETCH_MAX_SLOW', 3),
      maxConsecutiveBlocked:
        rate?.backpressure?.maxConsecutiveBlocked ??
        numberEnv('SEO_FETCH_MAX_BLOCKED', 2),
      maxConsecutiveErrors:
        rate?.backpressure?.maxConsecutiveErrors ??
        numberEnv('SEO_FETCH_MAX_ERRORS', 2),
      cooldownMs:
        rate?.backpressure?.cooldownMs ??
        numberEnv('SEO_FETCH_COOLDOWN_MS', 30_000),
      retryAfterCapMs:
        rate?.backpressure?.retryAfterCapMs ??
        numberEnv('SEO_FETCH_RETRY_AFTER_CAP_MS', 30_000),
    },
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

export function rateLimitDiagnostics(
  host: string,
  rate: NormalizedFetchRateControls,
): {
  host: string
  concurrency: number
  intervalCap: number
  intervalMs: number
} {
  return {
    host,
    concurrency: rate.concurrency,
    intervalCap: rate.intervalCap,
    intervalMs: rate.intervalMs,
  }
}

export function hostBackpressureSnapshot(host: string): BackpressureSnapshot {
  return snapshotForHost(host)
}

export async function waitForHostBackpressure(
  host: string,
  rate: NormalizedFetchRateControls,
): Promise<BackpressureSnapshot> {
  const health = healthForHost(host)
  const now = Date.now()

  if (health.stoppedUntil > now) {
    throw new OriginBackpressureError(snapshotForHost(host, 'stopped'))
  }

  const waitMs = Math.max(0, health.cooldownUntil - now)
  health.lastDelayMs = waitMs
  if (waitMs > 0) {
    await delay(Math.min(waitMs, rate.backpressure.cooldownMs))
    return snapshotForHost(host, 'slowed')
  }

  return snapshotForHost(host, 'ok')
}

export function retryAfterMs(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const dateMs = Date.parse(value)
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now())
  return undefined
}

export function recordHostFetch(input: {
  host: string
  status: number
  durationMs: number
  retryAfterMs?: number
  rate: NormalizedFetchRateControls
}): BackpressureSnapshot {
  const health = healthForHost(input.host)
  const cfg = input.rate.backpressure
  health.durations.push(input.durationMs)
  if (health.durations.length > 20) health.durations.shift()

  const blocked = [401, 403, 429].includes(input.status)
  const errored = input.status >= 500
  const slow = input.durationMs >= cfg.slowMs

  health.consecutiveBlocked = blocked ? health.consecutiveBlocked + 1 : 0
  health.consecutiveErrors = errored ? health.consecutiveErrors + 1 : 0
  health.consecutiveSlow = slow ? health.consecutiveSlow + 1 : 0

  if (!blocked && !errored && !slow) {
    health.reason = undefined
  }

  const retryDelay =
    input.retryAfterMs === undefined
      ? 0
      : Math.min(input.retryAfterMs, cfg.retryAfterCapMs)

  if (retryDelay > 0) {
    health.reason = `origin sent Retry-After (${Math.round(retryDelay / 1000)}s)`
    health.cooldownUntil = Math.max(
      health.cooldownUntil,
      Date.now() + retryDelay,
    )
  }

  if (input.durationMs >= cfg.verySlowMs) {
    health.reason = `very slow response (${input.durationMs}ms)`
    health.cooldownUntil = Math.max(
      health.cooldownUntil,
      Date.now() + cfg.cooldownMs,
    )
  }

  if (
    health.consecutiveSlow >= cfg.maxConsecutiveSlow ||
    health.consecutiveBlocked >= cfg.maxConsecutiveBlocked ||
    health.consecutiveErrors >= cfg.maxConsecutiveErrors
  ) {
    health.reason =
      health.consecutiveBlocked >= cfg.maxConsecutiveBlocked
        ? `${health.consecutiveBlocked} consecutive blocked responses`
        : health.consecutiveErrors >= cfg.maxConsecutiveErrors
          ? `${health.consecutiveErrors} consecutive error responses`
          : `${health.consecutiveSlow} consecutive slow responses`
    health.stoppedUntil = Date.now() + cfg.cooldownMs
  }

  return snapshotForHost(input.host)
}
