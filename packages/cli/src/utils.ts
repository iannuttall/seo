import Table from 'cli-table3'
import pc from 'picocolors'
import updateNotifier from 'update-notifier'

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
  const width = Math.max(...rows.map(([label]) => label.length), 0)
  for (const [label, value] of rows) {
    process.stdout.write(`${pc.bold(label.padEnd(width))}  ${value}\n`)
  }
}

export function printTable(
  head: string[],
  rows: Array<Array<string | number>>,
): void {
  const table = new Table({ head })
  for (const row of rows) {
    table.push(row)
  }
  process.stdout.write(`${table.toString()}\n`)
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
