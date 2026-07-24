import { intro, note, outro, password } from '@clack/prompts'
import {
  deleteSemrushApiKey,
  readSemrushApiKey,
  SEMRUSH_API_KEY_ENV,
  SemrushClient,
  SeoError,
  writeSemrushApiKey,
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

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Validate and save a Semrush Version 3 API key',
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
        `Run \`seo providers semrush connect\` in a terminal. Agents and CI can set ${SEMRUSH_API_KEY_ENV}.`,
      )
    }

    intro('Connect Semrush')
    note(
      'Use the permanent Version 3 API Key shown on your Semrush API Keys page. Semrush creates this key automatically. The balance check is free; research reports consume API units.',
      'API key',
    )
    const apiKey = maybeExitCancelled(
      await password({
        message: 'Semrush Version 3 API key',
        validate: (value) =>
          value?.trim() ? undefined : 'API key is required',
      }),
    )
    const balance = await new SemrushClient({ apiKey }).apiUnitBalance()
    const source = await writeSemrushApiKey(apiKey)

    note(
      `${balance.remainingUnits.toLocaleString('en-US')} API units remain.`,
      'Connection verified',
    )
    outro(
      `Saved in the ${credentialSourceLabel(source)}. Run seo providers semrush status --check to verify it again.`,
    )
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show the local Semrush connection',
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Verify the Version 3 API key with a free balance request.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const credential = await readSemrushApiKey()
    const shouldCheck = Boolean(args.check)
    const balance =
      shouldCheck && credential
        ? await new SemrushClient().apiUnitBalance()
        : undefined
    const result = {
      connected: Boolean(credential),
      apiVersion: credential ? 3 : null,
      credentialSource: credential?.source,
      migratedLegacyCredential: credential?.migrated ?? false,
      liveCheck: balance
        ? {
            status: 'passed' as const,
            remainingUnits: balance.remainingUnits,
            observedAt: balance.observedAt,
            requestCostUnits: 0,
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
      ...(balance
        ? ([
            [
              'API units remaining',
              balance.remainingUnits.toLocaleString('en-US'),
            ],
          ] satisfies Array<[string, string]>)
        : []),
    ])
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove the saved Semrush Version 3 API key',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    await deleteSemrushApiKey()
    const environmentCredential = Boolean(process.env[SEMRUSH_API_KEY_ENV])
    const result = {
      savedCredentialRemoved: true,
      environmentCredential: environmentCredential
        ? ('active' as const)
        : ('missing' as const),
      note: environmentCredential
        ? `The environment variable was not changed. Clear ${SEMRUSH_API_KEY_ENV} to fully disconnect.`
        : 'Semrush is disconnected.',
    }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`${result.note}\n`)
  },
})

export const semrushProviderCommand = defineCommand({
  meta: {
    name: 'semrush',
    description: 'Connect Semrush Version 3 for optional search data',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
  },
})
