import { intro, note, outro, password } from '@clack/prompts'
import {
  BING_API_KEY_ENV,
  deleteBingApiKey,
  readBingApiKey,
  SeoError,
  writeBingApiKey,
} from '@seo/core'
import { bingCall, listBingSites } from '@seo/core/commands'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../args.js'
import { canPrompt, maybeExitCancelled, printJson } from '../../utils.js'
import { credentialSourceLabel } from './shared.js'

const signIn = 'Run `seo providers bing connect` with a new API key.'

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Check and save a Bing Webmaster Tools API key',
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
        `Run \`seo providers bing connect\` in a terminal. Agents and CI can set ${BING_API_KEY_ENV}.`,
      )
    }
    intro('Connect Bing Webmaster Tools')
    note(
      'In Bing Webmaster Tools, open Settings, then API access, and copy the API key. Bing data is free.',
      'API key',
    )
    const apiKey = maybeExitCancelled(
      await password({
        message: 'Bing Webmaster API key',
        validate: (value) =>
          value?.trim() ? undefined : 'API key is required',
      }),
    )
    const sites = await listBingSites(bingCall({ apiKey }, { signIn }))
    const source = await writeBingApiKey(apiKey)
    note(
      `${sites.filter((site) => site.verified).length} verified sites.`,
      'Connection verified',
    )
    outro(`Saved in the ${credentialSourceLabel(source)}.`)
  },
})

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show the Bing Webmaster connection' },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const credential = await readBingApiKey()
    const sites = credential
      ? await listBingSites(bingCall({ apiKey: credential.apiKey }, { signIn }))
      : null
    const result = {
      connected: Boolean(credential),
      credentialSource: credential?.source ?? null,
      sites:
        sites?.filter((site) => site.verified).map((site) => site.url) ?? [],
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    process.stdout.write(
      credential
        ? `Connected (${credentialSourceLabel(credential.source)}). Verified sites: ${result.sites.join(', ') || 'none'}.\n`
        : 'Not connected. Run `seo providers bing connect`.\n',
    )
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove the saved Bing Webmaster API key',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    await deleteBingApiKey()
    const environment = Boolean(process.env[BING_API_KEY_ENV]?.trim())
    const message = environment
      ? `The saved key is removed. Clear ${BING_API_KEY_ENV} to fully disconnect.`
      : 'Bing is disconnected.'
    if (jsonFlag(args)) printJson({ removed: true, environment })
    else process.stdout.write(`${message}\n`)
  },
})

export const bingProviderCommand = defineCommand({
  meta: {
    name: 'bing',
    description: 'Connect Bing Webmaster Tools for Bing search data',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
  },
})
