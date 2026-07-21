import { intro, note, outro, password, text } from '@clack/prompts'
import {
  DATAFORSEO_LOGIN_ENV,
  DATAFORSEO_PASSWORD_ENV,
  DataForSeoClient,
  deleteDataForSeoCredentials,
  readDataForSeoCredentials,
  SeoError,
  writeDataForSeoCredentials,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../args.js'
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

export const dataForSeoProviderCommand = defineCommand({
  meta: {
    name: 'dataforseo',
    description: 'Connect DataForSEO for optional search data',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
  },
})
