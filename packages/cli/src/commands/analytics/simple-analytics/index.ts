import { intro, outro, password } from '@clack/prompts'
import {
  deleteSimpleAnalyticsKey,
  localResearchKeys,
  readSimpleAnalyticsKey,
  SeoError,
  SIMPLE_ANALYTICS_KEY_ENV,
  writeSimpleAnalyticsKey,
} from '@seo/core'
import {
  isSimpleAnalyticsKey,
  runSimpleAnalyticsRows,
} from '@seo/core/commands'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../../args.js'
import { requireSite } from '../../../selection.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
} from '../../../utils.js'
import {
  dates,
  detail,
  detailArg,
  run,
  SIMPLE_ANALYTICS_CONNECT,
} from '../../core-commands.js'

// A Simple Analytics API key saved on this machine only, and the Simple
// Analytics report. A key saved on the seoskill.dev account needs no
// command here; `seo login` brings it in.
//
// The key is not checked when it is saved: public websites answer any key,
// and Simple Analytics locks a key out after repeated failures, so the
// first report checks it instead.

function sourceLabel(source: string | undefined): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  if (source === 'environment') return SIMPLE_ANALYTICS_KEY_ENV
  return source ?? 'missing'
}

const json = {
  type: 'boolean',
  default: false,
  description: 'Print machine-readable JSON.',
} as const

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Save a Simple Analytics API key on this machine',
  },
  args: { json },
  run: async ({ args }) => {
    const asJson = jsonFlag(args)
    const interactive = canPrompt({ json: asJson })
    if (interactive) intro('Connect Simple Analytics')
    const key =
      process.env[SIMPLE_ANALYTICS_KEY_ENV]?.trim() ||
      (interactive
        ? maybeExitCancelled(
            await password({
              message: 'Simple Analytics API key',
              validate: (value) =>
                isSimpleAnalyticsKey(value ?? '')
                  ? undefined
                  : 'Enter an API key that starts with sa_api_key_ (Account settings, API keys)',
            }),
          )
        : undefined)
    if (!key) {
      throw new SeoError(
        'AUTH_REQUIRED',
        `Run this command in a terminal or set ${SIMPLE_ANALYTICS_KEY_ENV}.`,
      )
    }
    const source = await writeSimpleAnalyticsKey(key)
    if (asJson) {
      printJson({ connected: true, credentialSource: source })
      return
    }
    const message = `Simple Analytics API key saved in the ${sourceLabel(source)}. Next: seo analytics simple-analytics report --site example.com`
    if (interactive) outro(message)
    else process.stdout.write(`${message}\n`)
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show whether a Simple Analytics API key is saved here',
  },
  args: { json },
  run: async ({ args }) => {
    const saved = await readSimpleAnalyticsKey()
    const result = {
      connected: Boolean(saved),
      credentialSource: saved?.source,
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Connected', result.connected ? 'yes' : 'no'],
      ['Credential', sourceLabel(result.credentialSource)],
    ])
  },
})

// The same rows as seo_data with source simple_analytics.
const reportCommand = defineCommand({
  meta: {
    name: 'report',
    description:
      'Simple Analytics landing pages, referrers, utm_source tags and AI tools',
  },
  args: {
    site: { type: 'string', description: 'The site, such as example.com.' },
    ...dates,
    ...detail,
    json,
  },
  run: async ({ args }) => {
    const site = requireSite(stringArg(args.site))
    await run(args, async () =>
      runSimpleAnalyticsRows(
        {
          site,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        await localResearchKeys(),
        {
          connect: SIMPLE_ANALYTICS_CONNECT,
          call: (offset) =>
            `seo analytics simple-analytics report --site ${site} --detail rows --offset ${offset}`,
        },
      ),
    )
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove the Simple Analytics API key saved on this machine',
  },
  args: { json },
  run: async ({ args }) => {
    await deleteSimpleAnalyticsKey()
    const environment = Boolean(process.env[SIMPLE_ANALYTICS_KEY_ENV])
    if (jsonFlag(args)) {
      printJson({
        savedCredentialRemoved: true,
        environmentCredential: environment ? 'active' : 'missing',
      })
      return
    }
    process.stdout.write(
      environment
        ? `Saved key removed. ${SIMPLE_ANALYTICS_KEY_ENV} is still active.\n`
        : 'Simple Analytics is disconnected on this machine.\n',
    )
  },
})

export const simpleAnalyticsCommand = defineCommand({
  meta: {
    name: 'simple-analytics',
    description:
      'Read Simple Analytics, or save its API key on this machine only',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    report: reportCommand,
    disconnect: disconnectCommand,
  },
})
