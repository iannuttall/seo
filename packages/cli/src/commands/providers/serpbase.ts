import { randomUUID } from 'node:crypto'
import { intro, note, outro, password } from '@clack/prompts'
import {
  deleteSerpBaseApiKey,
  getProviderSpendSummary,
  readSerpBaseApiKey,
  SERPBASE_API_KEY_ENV,
  SeoError,
  SerpBaseClient,
  writeSerpBaseApiKey,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../args.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
} from '../../utils.js'
import {
  credentialSourceLabel,
  formatUsd,
  providerSpendLimitsCommand,
} from './shared.js'

async function liveCheck(apiKey?: string) {
  return new SerpBaseClient(apiKey ? { apiKey } : {}).search({
    keyword: 'serpbase connection check',
    countryCode: 'US',
    languageCode: 'en',
    device: 'desktop',
    page: 1,
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

const limitsCommand = providerSpendLimitsCommand({
  provider: 'serpbase',
  displayName: 'SerpBase',
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
