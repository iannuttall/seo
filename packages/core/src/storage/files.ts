import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

export function ensureParentDir(path: string, mode = 0o700): void {
  mkdirSync(dirname(path), { recursive: true, mode })
}

export function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

export function writeJsonAtomic(
  path: string,
  data: unknown,
  mode: number,
): void {
  ensureParentDir(path)
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode })
  chmodSync(tmp, mode)
  renameSync(tmp, path)
  chmodSync(path, mode)
}

export function fileMode(path: string): string {
  try {
    return `0${(statSync(path).mode & 0o777).toString(8)}`
  } catch {
    return 'missing'
  }
}

export function safeRemove(path: string): void {
  rmSync(path, { recursive: true, force: true })
}
