import * as z from 'zod/v4'

export const calendarDateSchema = z.iso.date('Use a YYYY-MM-DD date.')

export const calendarMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Use a YYYY-MM month.')

export function resolveJsOption(
  input: boolean | undefined,
  defaultValue: 'auto' | undefined,
): boolean | 'auto' | undefined {
  return input === undefined ? defaultValue : input
}
