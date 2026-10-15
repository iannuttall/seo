import * as z from 'zod/v4'

export const calendarDateSchema = z.iso.date('Use a YYYY-MM-DD date.')

export function resolveJsOption(
  input: boolean | undefined,
  defaultValue: 'auto' | undefined,
): boolean | 'auto' | undefined {
  return input === undefined ? defaultValue : input
}
