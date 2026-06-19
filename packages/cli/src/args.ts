import { readFile } from 'node:fs/promises'

export function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function projectArg(args: Record<string, unknown>): string | undefined {
  const project = stringArg(args.project)
  const client = stringArg(args.client)
  if (project && client && project !== client) {
    throw new Error('Use either --project or --client, not both.')
  }
  return project ?? client
}

export function booleanArg(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function negatedBooleanArg(
  args: Record<string, unknown>,
  name: string,
): boolean | undefined {
  const positive = booleanArg(args[name])
  if (positive === false) return true
  if (positive === true) return false
  const camelPositive = booleanArg(args[toCamelCase(name)])
  if (camelPositive === false) return true
  if (camelPositive === true) return false
  const explicitNo = booleanArg(args[`no-${name}`])
  if (explicitNo === true) return true
  const camelNo = booleanArg(args[`no${toPascalCase(name)}`])
  if (camelNo === true) return true
  return undefined
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toPascalCase(value: string): string {
  const camel = toCamelCase(value)
  return camel ? `${camel[0]?.toUpperCase()}${camel.slice(1)}` : ''
}

export function numberArg(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function csvArg(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

export function listArg(value: unknown): string[] {
  return csvArg(value) ?? []
}

export function fetchRateArg(args: Record<string, unknown>):
  | {
      concurrency?: number
      intervalCap?: number
      intervalMs?: number
    }
  | undefined {
  const rate = {
    concurrency: numberArg(args['fetch-concurrency']),
    intervalCap: numberArg(args['fetch-interval-cap']),
    intervalMs: numberArg(args['fetch-interval-ms']),
  }
  return Object.values(rate).some((value) => value !== undefined)
    ? rate
    : undefined
}

export function jsonFlag(args: Record<string, unknown>): boolean {
  return args.json === true
}

export async function jsonBodyArg(
  value: unknown,
  fileValue: unknown,
): Promise<Record<string, unknown> | undefined> {
  const inline = stringArg(value)
  const file = stringArg(fileValue)
  if (inline && file) {
    throw new Error('Use either --body or --body-file, not both.')
  }
  if (!inline && !file) return undefined
  const source = inline ?? (await readFile(file ?? '', 'utf8'))
  const parsed = JSON.parse(source) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON body must be an object.')
  }
  return parsed as Record<string, unknown>
}
