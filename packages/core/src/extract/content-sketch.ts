import { createHash } from 'node:crypto'

export type ContentSketch = {
  version: 1
  wordCount: number
  shingleSize: number
  sampledShingles: number
  hashes: string[]
}

const SHINGLE_SIZE = 5
const MAX_HASHES = 32

function words(value: string): string[] {
  return (
    value
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
}

function sampleIndexes(total: number, limit: number): number[] {
  if (total <= limit) return Array.from({ length: total }, (_, index) => index)
  return Array.from({ length: limit }, (_, index) =>
    Math.round((index * (total - 1)) / (limit - 1)),
  )
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function contentSketch(value: string): ContentSketch {
  const tokens = words(value)
  const shingleCount = Math.max(0, tokens.length - SHINGLE_SIZE + 1)
  const hashes = sampleIndexes(shingleCount, MAX_HASHES).map((index) =>
    digest(tokens.slice(index, index + SHINGLE_SIZE).join(' ')),
  )
  return {
    version: 1,
    wordCount: tokens.length,
    shingleSize: SHINGLE_SIZE,
    sampledShingles: hashes.length,
    hashes,
  }
}

export function contentSketchCoverage(
  source: ContentSketch | undefined,
  candidate: string,
): number | null {
  if (!source || source.hashes.length < 4) return null
  const targets = new Set(source.hashes)
  const matched = new Set<string>()
  const tokens = words(candidate)
  for (let index = 0; index <= tokens.length - source.shingleSize; index += 1) {
    const hash = digest(
      tokens.slice(index, index + source.shingleSize).join(' '),
    )
    if (targets.has(hash)) matched.add(hash)
    if (matched.size === targets.size) break
  }
  return Math.round((matched.size / targets.size) * 1_000) / 1_000
}
