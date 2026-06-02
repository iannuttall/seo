import { readFile } from 'node:fs/promises'

export function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function booleanArg(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
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
