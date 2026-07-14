import { stripVTControlCharacters } from 'node:util'
import pc from 'picocolors'
import stringWidth from 'string-width'

const DEFAULT_COLUMNS = 80
const MIN_COLUMNS = 40
const MAX_COLUMNS = 200

export type TerminalContext = {
  columns: number
  colors: ReturnType<typeof pc.createColors>
  hasColor: boolean
  isInteractive: boolean
}

export type TerminalContextOptions = {
  columns?: number
  color?: boolean
  env?: NodeJS.ProcessEnv
  isTTY?: boolean
  streamColumns?: number
}

function parsedColumns(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : undefined
  }
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function resolveTerminalColumns(
  options: TerminalContextOptions = {},
): number {
  const env = options.env ?? process.env
  const requested =
    parsedColumns(options.columns) ??
    parsedColumns(options.streamColumns) ??
    parsedColumns(env.COLUMNS) ??
    DEFAULT_COLUMNS
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, requested))
}

export function createTerminalContext(
  options: TerminalContextOptions = {},
): TerminalContext {
  const env = options.env ?? process.env
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY)
  const hasColor = options.color ?? Boolean(isTTY && env.NO_COLOR === undefined)
  return {
    columns: resolveTerminalColumns({
      ...options,
      env,
      streamColumns: options.streamColumns ?? process.stdout.columns,
    }),
    colors: pc.createColors(hasColor),
    hasColor,
    isInteractive: isTTY && !env.CI,
  }
}

export function visibleWidth(value: string): number {
  return stringWidth(stripVTControlCharacters(value))
}

function splitToken(token: string, width: number): string[] {
  const chunks: string[] = []
  let chunk = ''
  for (const character of token) {
    if (chunk && visibleWidth(`${chunk}${character}`) > width) {
      chunks.push(chunk)
      chunk = character
    } else {
      chunk += character
    }
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

function wrapLine(value: string, width: number): string[] {
  if (!value) return ['']
  const words = value.trim().split(/\s+/u)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const pieces = visibleWidth(word) > width ? splitToken(word, width) : [word]
    for (const piece of pieces) {
      if (!line) {
        line = piece
      } else if (visibleWidth(`${line} ${piece}`) <= width) {
        line += ` ${piece}`
      } else {
        lines.push(line)
        line = piece
      }
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

export function wrapText(value: string, width: number): string[] {
  const safeWidth = Math.max(1, width)
  return value
    .replaceAll('\r\n', '\n')
    .split('\n')
    .flatMap((line) => wrapLine(line, safeWidth))
}

export function truncateText(value: string, width: number): string {
  if (visibleWidth(value) <= width) return value
  const suffix = '...'
  const available = Math.max(1, width - visibleWidth(suffix))
  let result = ''
  for (const character of value) {
    if (visibleWidth(`${result}${character}`) > available) break
    result += character
  }
  return `${result}${suffix}`
}
