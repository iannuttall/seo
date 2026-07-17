import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { getSeoCliPaths } from '../paths.js'

const MEBIBYTE = 1024 * 1024

export const LOG_MAX_FILE_BYTES = 8 * MEBIBYTE
export const LOG_MAX_TOTAL_BYTES = 64 * MEBIBYTE
export const LOG_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

type LogFile = {
  path: string
  size: number
  modifiedAt: number
}

function logFiles(directory: string): LogFile[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
    .map((entry) => {
      const path = join(directory, entry.name)
      const stats = statSync(path)
      return { path, size: stats.size, modifiedAt: stats.mtimeMs }
    })
}

function rotatedPath(path: string, now: number): string {
  const directory = dirname(path)
  const stem = basename(path, '.log')
  let suffix = 0
  while (true) {
    const candidate = join(
      directory,
      `${stem}.${now}${suffix ? `-${suffix}` : ''}.log`,
    )
    if (!existsSync(candidate)) return candidate
    suffix += 1
  }
}

export type LogPruneResult = {
  rotated: number
  removed: number
  sizeBytes: number
}

export function pruneLogs(
  options: {
    directory?: string
    now?: number
    maxFileBytes?: number
    maxTotalBytes?: number
    maxAgeMs?: number
  } = {},
): LogPruneResult {
  const directory = options.directory ?? getSeoCliPaths().logDir
  const now = options.now ?? Date.now()
  const maxFileBytes = options.maxFileBytes ?? LOG_MAX_FILE_BYTES
  const maxTotalBytes = options.maxTotalBytes ?? LOG_MAX_TOTAL_BYTES
  const maxAgeMs = options.maxAgeMs ?? LOG_MAX_AGE_MS
  mkdirSync(directory, { recursive: true, mode: 0o700 })

  let rotated = 0
  let removed = 0
  for (const file of logFiles(directory)) {
    if (file.size <= maxFileBytes) continue
    renameSync(file.path, rotatedPath(file.path, now))
    rotated += 1
  }

  for (const file of logFiles(directory)) {
    if (file.modifiedAt >= now - maxAgeMs) continue
    rmSync(file.path, { force: true })
    removed += 1
  }

  const retained = logFiles(directory).sort(
    (left, right) =>
      left.modifiedAt - right.modifiedAt ||
      (left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  )
  let sizeBytes = retained.reduce((total, file) => total + file.size, 0)
  for (const file of retained) {
    if (sizeBytes <= maxTotalBytes) break
    rmSync(file.path, { force: true })
    sizeBytes -= file.size
    removed += 1
  }

  return { rotated, removed, sizeBytes }
}
