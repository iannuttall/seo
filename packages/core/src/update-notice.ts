import { request } from 'node:https'
import { join } from 'node:path'
import { readJson } from './http/read-json.js'
import { getSeoCliPaths } from './paths.js'
import { readJsonFile, writeJsonAtomic } from './storage/files.js'
import { isTelemetryCi } from './telemetry.js'
import { SEO_VERSION } from './version.js'

// One line telling a person or agent that a newer seo exists. It reads only
// a small cache file, so it never waits on the network. When the cache is a
// day old, it starts one bounded check of the npm registry in the
// background. The check's socket and timer do not keep the process alive,
// so a short command exits on time and the next run tries again.

const REGISTRY_URL = 'https://registry.npmjs.org/seo/latest'
const CHECK_EVERY_MS = 86_400_000
const TIMEOUT_MS = 2_000
const MAX_BYTES = 65_536

type LatestCache = { checkedAt: number; latest: string }

export type UpdateNoticeOptions = {
  argv?: string[]
  cacheFile?: string
  env?: NodeJS.ProcessEnv
  now?: Date
  version?: string
}

let checking = false

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (value: string) =>
    value
      .replace(/^v/, '')
      .split('-')[0]
      ?.split('.')
      .map((part) => Number.parseInt(part, 10)) ?? []
  const currentParts = parse(current)
  const latestParts = parse(latest)
  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentParts[index] ?? 0
    const latestPart = latestParts[index] ?? 0
    if (!Number.isFinite(currentPart) || !Number.isFinite(latestPart)) {
      return false
    }
    if (latestPart > currentPart) return true
    if (latestPart < currentPart) return false
  }
  return false
}

function isLatestCache(value: unknown): value is LatestCache {
  if (!value || typeof value !== 'object') return false
  const cache = value as Partial<LatestCache>
  return (
    typeof cache.checkedAt === 'number' &&
    typeof cache.latest === 'string' &&
    /^\d+\.\d+\.\d+$/.test(cache.latest)
  )
}

function checkRegistry(cacheFile: string, now: number): void {
  if (checking) return
  checking = true
  const done = () => {
    checking = false
  }
  const req = request(REGISTRY_URL, {
    headers: { accept: 'application/json' },
  })
  const timer = setTimeout(() => req.destroy(), TIMEOUT_MS)
  timer.unref()
  req.on('socket', (socket) => socket.unref())
  // Errors, timeouts and oversized bodies all end in close.
  req.on('error', () => undefined)
  req.on('close', () => {
    clearTimeout(timer)
    done()
  })
  req.on('response', (response) => {
    const chunks: Buffer[] = []
    let size = 0
    response.on('error', () => undefined)
    response.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BYTES) req.destroy()
      else chunks.push(chunk)
    })
    response.on('end', () => {
      if (response.statusCode !== 200 || size > MAX_BYTES) return
      readJson<{ version?: unknown }>(
        new Response(Buffer.concat(chunks)),
        'The npm registry',
      )
        .then((body) => {
          const cache = { checkedAt: now, latest: body.version }
          if (isLatestCache(cache)) writeJsonAtomic(cacheFile, cache, 0o600)
        })
        .catch(() => undefined)
    })
  })
  req.end()
}

// The notice line, or undefined when seo is current, the latest version is
// not known yet, or update notices are off (NO_UPDATE_NOTIFIER,
// --no-update-notifier, CI or tests).
export function updateNotice(
  options: UpdateNoticeOptions = {},
): string | undefined {
  try {
    const env = options.env ?? process.env
    const argv = options.argv ?? process.argv
    if (
      env.NO_UPDATE_NOTIFIER ||
      argv.includes('--no-update-notifier') ||
      isTelemetryCi(env)
    ) {
      return undefined
    }
    const cacheFile =
      options.cacheFile ??
      join(getSeoCliPaths().cacheDir, 'latest-version.json')
    const now = (options.now ?? new Date()).getTime()
    const stored = readJsonFile<unknown>(cacheFile)
    const cache = isLatestCache(stored) ? stored : undefined
    if (!cache || now - cache.checkedAt >= CHECK_EVERY_MS) {
      checkRegistry(cacheFile, now)
    }
    const current = options.version ?? SEO_VERSION
    if (!cache || !isNewerVersion(current, cache.latest)) return undefined
    return `seo ${cache.latest} is out (you have ${current}). Update with: npm i -g seo`
  } catch {
    return undefined
  }
}
