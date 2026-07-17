import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import pino from 'pino'
import pretty from 'pino-pretty'
import { ensureSeoCliDirs } from './paths.js'
import { pruneLogs } from './storage/log-retention.js'

let loggerInstance: pino.Logger | undefined

export function createLogger(runId: string): pino.Logger {
  if (loggerInstance) {
    return loggerInstance.child({ runId })
  }

  const paths = ensureSeoCliDirs()
  pruneLogs({ directory: paths.logDir })
  const date = new Date().toISOString().slice(0, 10)
  const fileStream = createWriteStream(join(paths.logDir, `${date}.log`), {
    flags: 'a',
  })
  const destination = process.stderr.isTTY
    ? pretty({ colorize: true, destination: 1 })
    : fileStream

  loggerInstance = pino({ level: process.env.LOG_LEVEL ?? 'info' }, destination)
  return loggerInstance.child({ runId })
}

export function makeRunId(): string {
  return Math.random().toString(36).slice(2, 10)
}
