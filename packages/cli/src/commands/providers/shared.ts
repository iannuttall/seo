import {
  getProviderSpendLimits,
  type ProviderId,
  SeoError,
  setProviderSpendLimits,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue } from '../../utils.js'

export function credentialSourceLabel(
  source: 'environment' | 'keychain' | 'file' | undefined,
): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  return source ?? 'missing'
}

export function formatUsd(micros: number | null): string {
  return micros === null ? 'unavailable' : `$${(micros / 1_000_000).toFixed(2)}`
}

export function usdMicrosArg(
  value: unknown,
  label: string,
  options: { notice: true },
): number | undefined
export function usdMicrosArg(
  value: unknown,
  label: string,
  options?: { notice?: false },
): number | null | undefined
export function usdMicrosArg(
  value: unknown,
  label: string,
  options: { notice?: boolean } = {},
): number | null | undefined {
  if (value === undefined) return undefined
  const raw = stringArg(value)?.trim().toLowerCase()
  if (raw === 'off') return options.notice ? 0 : null
  const dollars = numberArg(value)
  if (dollars === undefined || dollars < 0 || dollars > 1_000_000) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be a USD amount from 0 to 1000000, or off.`,
    )
  }
  const micros = Math.round(dollars * 1_000_000)
  if (!Number.isSafeInteger(micros)) {
    throw new SeoError('INVALID_INPUT', `${label} is too precise.`)
  }
  return micros
}

export function boundedIntegerArg(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined
  const parsed = numberArg(value)
  if (
    parsed === undefined ||
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    )
  }
  return parsed
}

export function providerSpendLimitsCommand(input: {
  provider: ProviderId
  displayName: string
}) {
  return defineCommand({
    meta: {
      name: 'limits',
      description: `Show or change local ${input.displayName} spend limits`,
    },
    args: {
      'daily-notice': {
        type: 'string',
        description: 'UTC daily notice in USD, or off.',
      },
      'daily-limit': {
        type: 'string',
        description: 'UTC daily hard limit in USD, or off.',
      },
      'monthly-limit': {
        type: 'string',
        description: 'UTC monthly hard limit in USD, or off.',
      },
      requests: {
        type: 'string',
        description: 'Maximum provider requests in one report run.',
      },
      rows: {
        type: 'string',
        description: 'Maximum requested provider rows in one report run.',
      },
      json: {
        type: 'boolean',
        default: false,
        description: 'Print machine-readable JSON.',
      },
    },
    run: async ({ args }) => {
      const current = getProviderSpendLimits(input.provider)
      const dailyNoticeMicros = usdMicrosArg(
        args['daily-notice'],
        '--daily-notice',
        { notice: true },
      )
      const dailyHardLimitMicros = usdMicrosArg(
        args['daily-limit'],
        '--daily-limit',
      )
      const monthlyHardLimitMicros = usdMicrosArg(
        args['monthly-limit'],
        '--monthly-limit',
      )
      const maxRequestsPerReport = boundedIntegerArg(
        args.requests,
        '--requests',
        1,
        100,
      )
      const maxRowsPerReport = boundedIntegerArg(
        args.rows,
        '--rows',
        1,
        100_000,
      )
      const changed = [
        dailyNoticeMicros,
        dailyHardLimitMicros,
        monthlyHardLimitMicros,
        maxRequestsPerReport,
        maxRowsPerReport,
      ].some((value) => value !== undefined)
      const limits = changed
        ? setProviderSpendLimits(input.provider, {
            dailyNoticeMicros:
              dailyNoticeMicros === undefined
                ? current.dailyNoticeMicros
                : dailyNoticeMicros,
            dailyHardLimitMicros:
              dailyHardLimitMicros === undefined
                ? current.dailyHardLimitMicros
                : dailyHardLimitMicros,
            monthlyHardLimitMicros:
              monthlyHardLimitMicros === undefined
                ? current.monthlyHardLimitMicros
                : monthlyHardLimitMicros,
            maxRequestsPerReport:
              maxRequestsPerReport ?? current.maxRequestsPerReport,
            maxRowsPerReport: maxRowsPerReport ?? current.maxRowsPerReport,
          })
        : current
      const result = { provider: input.provider, changed, limits }
      if (jsonFlag(args)) {
        printJson(result)
        return
      }
      printKeyValue([
        [
          'UTC daily notice',
          limits.dailyNoticeMicros === 0
            ? 'off'
            : formatUsd(limits.dailyNoticeMicros),
        ],
        [
          'UTC daily hard limit',
          limits.dailyHardLimitMicros === null
            ? 'off'
            : formatUsd(limits.dailyHardLimitMicros),
        ],
        [
          'UTC monthly hard limit',
          limits.monthlyHardLimitMicros === null
            ? 'off'
            : formatUsd(limits.monthlyHardLimitMicros),
        ],
        ['Requests per report', String(limits.maxRequestsPerReport)],
        ['Rows per report', String(limits.maxRowsPerReport)],
      ])
    },
  })
}
