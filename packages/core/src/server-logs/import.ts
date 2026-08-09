import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SeoError } from '../errors.js'
import {
  analyzeServerLogChunks,
  SERVER_LOG_LIMITS,
  serverLogFormatForFilename,
} from './analysis.js'
import type { ServerLogEvidence, ServerLogFormat } from './types.js'

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const result = value ?? fallback
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be between 1 and ${maximum}.`,
    )
  }
  return result
}

async function* fileChunks(path: string): AsyncGenerator<Uint8Array> {
  const stream = createReadStream(path, {
    highWaterMark: SERVER_LOG_LIMITS.chunkBytes,
  })
  for await (const chunk of stream) yield chunk
}

export async function importServerLog(input: {
  file: string
  format?: ServerLogFormat
  rowLimit?: number
  pathLimit?: number
}): Promise<ServerLogEvidence> {
  const path = resolve(input.file)
  const file = await stat(path).catch(() => undefined)
  if (!file?.isFile()) {
    throw new SeoError('INVALID_INPUT', `Server log was not found: ${path}`)
  }
  const rowLimit = boundedInteger(
    input.rowLimit,
    SERVER_LOG_LIMITS.defaultRows,
    SERVER_LOG_LIMITS.maximumRows,
    'Server log row limit',
  )
  const pathLimit = boundedInteger(
    input.pathLimit,
    SERVER_LOG_LIMITS.defaultPaths,
    SERVER_LOG_LIMITS.maximumPaths,
    'Server log path limit',
  )

  return analyzeServerLogChunks({
    chunks: fileChunks(path),
    file: { path, fileBytes: file.size },
    format: serverLogFormatForFilename(path, input.format),
    rowLimit,
    pathLimit,
    byteLimit: SERVER_LOG_LIMITS.maximumBytes,
    maxLineBytes: SERVER_LOG_LIMITS.maximumLineBytes,
  })
}
