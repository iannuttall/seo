import updateNotifier from 'update-notifier'
import { createTerminalContext } from './presentation/context.js'
import {
  renderCallout,
  renderKeyValues,
  renderTable,
} from './presentation/render.js'

export function maybeCheckForUpdates(pkg: { name: string; version: string }) {
  if (process.env.CI || process.env.NO_UPDATE_NOTIFIER) {
    return
  }

  updateNotifier({ pkg, shouldNotifyInNpmScript: false }).notify()
}

export function canPrompt(options: { json?: boolean } = {}): boolean {
  return Boolean(
    !options.json &&
      process.stdin.isTTY &&
      process.stdout.isTTY &&
      !process.env.CI,
  )
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

export function printKeyValue(rows: Array<[string, string]>): void {
  const output = renderKeyValues(rows, createTerminalContext())
  if (output) process.stdout.write(`${output}\n`)
}

export function printTable(
  head: string[],
  rows: Array<Array<string | number>>,
): void {
  process.stdout.write(`${renderTable(head, rows, createTerminalContext())}\n`)
}

export function printCallout(callout: {
  body?: string
  command?: string
  title: string
}): void {
  process.stdout.write(`${renderCallout(callout, createTerminalContext())}\n`)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function maybeExitCancelled<T>(value: T | symbol): T {
  if (typeof value === 'symbol') {
    process.exit(1)
  }
  return value
}
