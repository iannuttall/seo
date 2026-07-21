import { intro, note, outro, password, text } from '@clack/prompts'
import {
  DATAFORSEO_LOGIN_ENV,
  DATAFORSEO_PASSWORD_ENV,
  DataForSeoClient,
  deleteDataForSeoCredentials,
  getProviderSpendLimits,
  getProviderSpendSummary,
  readDataForSeoCredentials,
  SeoError,
  setProviderSpendLimits,
  writeDataForSeoCredentials,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  defaultTrueBooleanArg,
  jsonFlag,
  numberArg,
  stringArg,
} from '../../args.js'
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

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Validate and save DataForSEO API credentials',
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
        `Run \`seo providers dataforseo connect\` in a terminal. Agents and CI can set ${DATAFORSEO_LOGIN_ENV} and ${DATAFORSEO_PASSWORD_ENV}.`,
      )
    }

    intro('Connect DataForSEO')
    note(
      'Use the API login and API password from DataForSEO API Access. The validation call is free; later research reports can make charged requests.',
      'API credentials',
    )
    const login = maybeExitCancelled(
      await text({
        message: 'DataForSEO API login',
        validate: (value) =>
          value?.trim() ? undefined : 'API login is required',
      }),
    )
    const apiPassword = maybeExitCancelled(
      await password({
        message: 'DataForSEO API password',
        validate: (value) => (value ? undefined : 'API password is required'),
      }),
    )
    const credentials = { login: login.trim(), password: apiPassword }
    const account = await new DataForSeoClient({
      credentials: () => credentials,
    }).userData()
    const source = await writeDataForSeoCredentials(credentials)

    note(
      `${account.login} is connected with an account balance of ${formatUsd(account.balanceMicros)}.`,
      'Connection verified',
    )
    outro(
      `Saved in the ${credentialSourceLabel(source)}. Run seo providers dataforseo status --check to verify it again.`,
    )
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show the local DataForSEO connection',
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Verify credentials with the free account endpoint.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const credentials = await readDataForSeoCredentials()
    const shouldCheck = Boolean(args.check)
    const account =
      shouldCheck && credentials
        ? await new DataForSeoClient().userData()
        : undefined
    const result = {
      connected: Boolean(credentials),
      credentialSource: credentials?.source,
      migratedLegacyCredentials: credentials?.migrated ?? false,
      liveCheck: account
        ? {
            status: 'passed' as const,
            account: account.login,
            timezone: account.timezone,
            balanceMicros: account.balanceMicros,
            observedAt: account.observedAt,
            requestCostMicros: account.requestCostMicros,
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
            : 'not requested; pass --check to verify',
      ],
      ...(account
        ? ([
            ['Account', account.login],
            ['Balance', formatUsd(account.balanceMicros)],
          ] satisfies Array<[string, string]>)
        : []),
    ])
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove saved DataForSEO credentials',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    await deleteDataForSeoCredentials()
    const hasEnvironmentLogin = Boolean(
      process.env[DATAFORSEO_LOGIN_ENV]?.trim(),
    )
    const hasEnvironmentPassword = Boolean(process.env[DATAFORSEO_PASSWORD_ENV])
    const result = {
      savedCredentialsRemoved: true,
      environmentCredentials:
        hasEnvironmentLogin && hasEnvironmentPassword
          ? ('active' as const)
          : hasEnvironmentLogin || hasEnvironmentPassword
            ? ('partial' as const)
            : ('missing' as const),
      note:
        hasEnvironmentLogin || hasEnvironmentPassword
          ? `Environment variables were not changed. Clear ${DATAFORSEO_LOGIN_ENV} and ${DATAFORSEO_PASSWORD_ENV} to fully disconnect.`
          : 'DataForSEO is disconnected.',
    }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`${result.note}\n`)
  },
})

const limitsCommand = defineCommand({
  meta: {
    name: 'limits',
    description: 'Show or change local DataForSEO spend limits',
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
    const current = getProviderSpendLimits('dataforseo')
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
      ? setProviderSpendLimits('dataforseo', {
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
    const result = { provider: 'dataforseo' as const, changed, limits }
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
    description: 'Show local DataForSEO spend and account context',
  },
  args: {
    account: defaultTrueBooleanArg(
      'Read account-wide context from the free endpoint.',
      'Show only the local spend ledger.',
    ),
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const local = getProviderSpendSummary('dataforseo')
    const credentials = args.account
      ? await readDataForSeoCredentials()
      : undefined
    let account:
      | {
          status: 'observed'
          account: string
          balanceMicros: number | null
          dailySpendMicros: number | null
          dailySpendPeriod: string | null
          dailyLimitMicros: number | null
          observedAt: string
          requestCostMicros: number
          semantics: string
        }
      | { status: 'unavailable'; reason: string }
      | { status: 'not-requested' }
    if (!args.account) {
      account = { status: 'not-requested' }
    } else if (!credentials) {
      account = {
        status: 'unavailable',
        reason:
          'DataForSEO is not connected. Local spend remains available without account context.',
      }
    } else {
      try {
        const snapshot = await new DataForSeoClient().userData()
        account = {
          status: 'observed',
          account: snapshot.login,
          balanceMicros: snapshot.balanceMicros,
          dailySpendMicros: snapshot.accountDailySpendMicros,
          dailySpendPeriod: snapshot.accountDailySpendPeriod,
          dailyLimitMicros: snapshot.accountDailyLimitMicros,
          observedAt: snapshot.observedAt,
          requestCostMicros: snapshot.requestCostMicros,
          semantics:
            'Account values include every client using these credentials. Local values include only requests recorded by this installation.',
        }
      } catch (error) {
        account = {
          status: 'unavailable',
          reason:
            error instanceof Error
              ? error.message
              : 'DataForSEO account context is unavailable.',
        }
      }
    }
    const result = { local, account }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      [
        'Local today (UTC)',
        `${formatUsd(local.today.effectiveCostMicros)} across ${local.today.requests} requests`,
      ],
      [
        'Local month (UTC)',
        `${formatUsd(local.month.effectiveCostMicros)} across ${local.month.requests} requests`,
      ],
      [
        'Unknown local cost',
        formatUsd(local.month.estimatedOrUnknownCostMicros),
      ],
      [
        'Account today',
        account.status === 'observed'
          ? formatUsd(account.dailySpendMicros)
          : account.status === 'unavailable'
            ? account.reason
            : 'not requested',
      ],
      [
        'Account balance',
        account.status === 'observed'
          ? formatUsd(account.balanceMicros)
          : 'unavailable',
      ],
    ])
    if (account.status === 'observed')
      process.stdout.write(`${account.semantics}\n`)
  },
})

export const dataForSeoProviderCommand = defineCommand({
  meta: {
    name: 'dataforseo',
    description: 'Connect DataForSEO for optional search data',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    limits: limitsCommand,
    spend: spendCommand,
    disconnect: disconnectCommand,
  },
})
