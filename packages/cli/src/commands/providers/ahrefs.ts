import { intro, note, outro, password } from '@clack/prompts'
import {
  AHREFS_API_KEY_ENV,
  AhrefsClient,
  deleteAhrefsApiKey,
  getProviderSpendLimits,
  readAhrefsApiKey,
  SeoError,
  setProviderSpendLimits,
  writeAhrefsApiKey,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg } from '../../args.js'
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

function unitUsage(input: {
  limit: number | null
  used: number | null
  remaining: number | null
}): string {
  if (input.limit === null) {
    return input.used === null
      ? 'not reported'
      : `${input.used.toLocaleString('en-US')} used; no key limit`
  }
  return `${(input.remaining ?? 0).toLocaleString('en-US')} of ${input.limit.toLocaleString('en-US')} remaining`
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
    description: 'Validate and save an Ahrefs API v3 key',
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
        `Run \`seo providers ahrefs connect\` in a terminal. Agents and CI can set ${AHREFS_API_KEY_ENV}.`,
      )
    }

    intro('Connect Ahrefs')
    note(
      'Paste an API v3 key from Ahrefs Account settings. The validation check and Domain Rating are free; other research can consume API units.',
      'API key',
    )
    const apiKey = maybeExitCancelled(
      await password({
        message: 'Ahrefs API v3 key',
        validate: (value) =>
          value?.trim() ? undefined : 'API key is required',
      }),
    )
    const account = await new AhrefsClient({ apiKey }).limitsAndUsage()
    const source = await writeAhrefsApiKey(apiKey)

    note(
      `${account.subscription} subscription. API key units: ${unitUsage(account.apiKeyUnits)}.`,
      'Connection verified',
    )
    outro(
      `Saved in the ${credentialSourceLabel(source)}. Run seo providers ahrefs status --check to verify it again.`,
    )
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show the local Ahrefs connection',
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Verify the API key with the free account endpoint.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const credential = await readAhrefsApiKey()
    const shouldCheck = Boolean(args.check)
    const account =
      shouldCheck && credential
        ? await new AhrefsClient().limitsAndUsage()
        : undefined
    const result = {
      connected: Boolean(credential),
      apiVersion: credential ? 3 : null,
      credentialSource: credential?.source,
      liveCheck: account
        ? {
            status: 'passed' as const,
            subscription: account.subscription,
            apiKeyExpiresAt: account.apiKeyExpiresAt,
            usageResetsAt: account.usageResetsAt,
            apiKeyUnits: account.apiKeyUnits,
            workspaceUnits: account.workspaceUnits,
            observedAt: account.observedAt,
            requestCostUnits: account.requestCostUnits,
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
      ['API version', result.apiVersion ? 'Version 3' : 'not connected'],
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
            ['Subscription', account.subscription],
            ['API key units', unitUsage(account.apiKeyUnits)],
            ['Workspace units', unitUsage(account.workspaceUnits)],
            ['Usage resets', account.usageResetsAt],
            ['Key expires', account.apiKeyExpiresAt],
          ] satisfies Array<[string, string]>)
        : []),
    ])
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove the saved Ahrefs API v3 key',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    await deleteAhrefsApiKey()
    const environmentCredential = Boolean(
      process.env[AHREFS_API_KEY_ENV]?.trim(),
    )
    const result = {
      savedCredentialRemoved: true,
      environmentCredential: environmentCredential
        ? ('active' as const)
        : ('missing' as const),
      note: environmentCredential
        ? `The environment variable was not changed. Clear ${AHREFS_API_KEY_ENV} to fully disconnect.`
        : 'Ahrefs is disconnected.',
    }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`${result.note}\n`)
  },
})

const limitsCommand = defineCommand({
  meta: {
    name: 'limits',
    description: 'Show or change local Ahrefs report work limits',
  },
  args: {
    requests: {
      type: 'string',
      description: 'Maximum Ahrefs requests in one report run.',
    },
    rows: {
      type: 'string',
      description: 'Maximum requested Ahrefs rows in one report run.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const current = getProviderSpendLimits('ahrefs')
    const maxRequestsPerReport = boundedIntegerArg(
      args.requests,
      '--requests',
      1,
      100,
    )
    const maxRowsPerReport = boundedIntegerArg(args.rows, '--rows', 1, 100_000)
    const changed =
      maxRequestsPerReport !== undefined || maxRowsPerReport !== undefined
    const limits = changed
      ? setProviderSpendLimits('ahrefs', {
          ...current,
          maxRequestsPerReport:
            maxRequestsPerReport ?? current.maxRequestsPerReport,
          maxRowsPerReport: maxRowsPerReport ?? current.maxRowsPerReport,
        })
      : current
    const result = {
      provider: 'ahrefs' as const,
      maxRequestsPerReport: limits.maxRequestsPerReport,
      maxRowsPerReport: limits.maxRowsPerReport,
      changed,
      note: 'Paid requests also preflight the live API-unit balance and enforce fixed per-request and per-report unit caps.',
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Requests per report', String(result.maxRequestsPerReport)],
      ['Rows per report', String(result.maxRowsPerReport)],
      ['Changed', result.changed ? 'yes' : 'no'],
      ['Note', result.note],
    ])
  },
})

export const ahrefsProviderCommand = defineCommand({
  meta: {
    name: 'ahrefs',
    description: 'Connect Ahrefs for optional search and link data',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    limits: limitsCommand,
    disconnect: disconnectCommand,
  },
})
