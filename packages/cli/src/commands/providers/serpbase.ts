import { randomUUID } from 'node:crypto'
import { intro, note, outro, password } from '@clack/prompts'
import {
  deleteSerpBaseApiKey,
  getProviderSpendLimits,
  getProviderSpendSummary,
  readSerpBaseApiKey,
  SERPBASE_API_KEY_ENV,
  SeoError,
  SerpBaseClient,
  setProviderSpendLimits,
  writeSerpBaseApiKey,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
} from '../../utils.js'

function credentialSourceLabel(
  source: 'environment' | 'keychain' | 'file' | undefined,
): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  return source ?? 'missing'
}

function formatUsd(micros: number | null): string {
  return micros === null ? 'unavailable' : `$${(micros / 1_000_000).toFixed(2)}`
}

function usdMicrosArg(
  value: unknown,
  label: string,
  options: { notice: true },
): number | undefined
function usdMicrosArg(
  value: unknown,
  label: string,
  options?: { notice?: false },
): number | null | undefined
function usdMicrosArg(
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

function boundedIntegerArg(
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

async function liveCheck(apiKey?: string) {
  return new SerpBaseClient(apiKey ? { apiKey } : {}).search({
    keyword: 'serpbase connection check',
    countryCode: 'US',
    languageCode: 'en',
    device: 'desktop',
    requestedRows: 10,
    refresh: true,
    context: {
      reportId: 'provider-status',
      reportRunId: randomUUID(),
    },
  })
}

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Validate and save a SerpBase API key',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    if (!canPrompt({ json: jsonFlag(args) })) {
      throw new SeoError(
        'AUTH_REQUIRED',
        `Run \`seo providers serpbase connect\` in a terminal. Agents and CI can set ${SERPBASE_API_KEY_ENV}.`,
      )
    }

    intro('Connect SerpBase')
    note(
      'Paste an API key from the SerpBase dashboard. Validation runs one billed Google Search request before the key is saved.',
      'API key',
    )
    const apiKey = maybeExitCancelled(
      await password({
        message: 'SerpBase API key',
        validate: (value) =>
          value?.trim() ? undefined : 'API key is required',
      }),
    ).trim()
    const check = await liveCheck(apiKey)
    const source = await writeSerpBaseApiKey(apiKey)
    note(
      `The live check passed and used ${check.cost.native?.actualUnits ?? 0} credit.`,
      'Connection verified',
    )
    outro(
      `Saved in the ${credentialSourceLabel(source)}. Run seo providers serpbase status to review the connection.`,
    )
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show the local SerpBase connection',
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Verify the API key with one billed Search request.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const credential = await readSerpBaseApiKey()
    const shouldCheck = Boolean(args.check)
    const check = shouldCheck && credential ? await liveCheck() : undefined
    const result = {
      connected: Boolean(credential),
      credentialSource: credential?.source,
      liveCheck: check
        ? {
            status: 'passed' as const,
            requestId: check.cost.taskIds[0] ?? null,
            creditsCharged: check.cost.native?.actualUnits ?? null,
            estimatedCostMicros: check.cost.estimatedMicros,
            actualCostMicros: check.cost.actualMicros,
            observedAt: check.observedAt,
          }
        : {
            status: (shouldCheck ? 'unavailable' : 'not-requested') as
              | 'unavailable'
              | 'not-requested',
          },
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Connected', result.connected ? 'yes' : 'no'],
      ['Credential', credentialSourceLabel(result.credentialSource)],
      [
        'Live check',
        result.liveCheck.status === 'passed'
          ? `passed at ${result.liveCheck.observedAt}`
          : result.liveCheck.status === 'unavailable'
            ? 'not available without credentials'
            : 'not requested; pass --check to run one billed search',
      ],
    ])
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove the saved SerpBase API key',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    await deleteSerpBaseApiKey()
    const environmentCredential = Boolean(
      process.env[SERPBASE_API_KEY_ENV]?.trim(),
    )
    const result = {
      savedCredentialRemoved: true,
      environmentCredential: environmentCredential
        ? ('active' as const)
        : ('missing' as const),
      note: environmentCredential
        ? `The environment variable was not changed. Clear ${SERPBASE_API_KEY_ENV} to fully disconnect.`
        : 'SerpBase is disconnected.',
    }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`${result.note}\n`)
  },
})

const limitsCommand = defineCommand({
  meta: {
    name: 'limits',
    description: 'Show or change local SerpBase spend limits',
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
    const current = getProviderSpendLimits('serpbase')
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
    const maxRowsPerReport = boundedIntegerArg(args.rows, '--rows', 1, 100_000)
    const changed = [
      dailyNoticeMicros,
      dailyHardLimitMicros,
      monthlyHardLimitMicros,
      maxRequestsPerReport,
      maxRowsPerReport,
    ].some((value) => value !== undefined)
    const limits = changed
      ? setProviderSpendLimits('serpbase', {
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
    const result = { provider: 'serpbase' as const, changed, limits }
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

const spendCommand = defineCommand({
  meta: {
    name: 'spend',
    description: 'Show locally recorded SerpBase spend estimates',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const result = {
      local: getProviderSpendSummary('serpbase'),
      semantics:
        'SerpBase reports charged credits but not the account-specific USD value. The local ledger uses the highest currently advertised standard Search price as a conservative estimate.',
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Today', formatUsd(result.local.today.effectiveCostMicros)],
      ['This month', formatUsd(result.local.month.effectiveCostMicros)],
      ['Requests today', String(result.local.today.requests)],
      ['Cost basis', result.semantics],
    ])
  },
})

export const serpBaseProviderCommand = defineCommand({
  meta: {
    name: 'serpbase',
    description: 'Connect SerpBase for live Google results',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
    limits: limitsCommand,
    spend: spendCommand,
  },
})
