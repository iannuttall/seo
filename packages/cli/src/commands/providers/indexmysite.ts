import {
  cloudAccountUrl,
  cloudLinked,
  disconnectLocalIndexMySite,
  localError,
  localIndexMySite,
  localIndexMySiteSource,
  SeoError,
  startLocalIndexMySiteConnect,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../args.js'
import { printJson } from '../../utils.js'

// Index My Site, connected with OAuth: a browser sign-in on this machine,
// or the seoskill.dev account's connection on a machine linked with
// `seo login`. No API key is pasted anywhere.

const write = (text: string) => process.stdout.write(`${text}\n`)
const json = {
  type: 'boolean',
  default: false,
  description: 'Print JSON.',
} as const

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Connect your Index My Site account with a browser sign-in',
  },
  args: { json },
  run: async ({ args }) => {
    try {
      if ((await localIndexMySiteSource()) === 'machine') {
        write(
          'Index My Site is already connected on this machine. Run `seo providers indexmysite disconnect` first to connect another account.',
        )
        return
      }
      if (cloudLinked()) {
        const url = `${cloudAccountUrl()}#indexmysite`
        if (jsonFlag(args)) printJson({ status: 'account', url })
        else
          write(
            `This machine uses your seoskill.dev account. Connect Index My Site there, once, for every linked machine and the hosted MCP: ${url}`,
          )
        return
      }
      const started = await startLocalIndexMySiteConnect()
      write(
        `Opening Index My Site to approve SEO Skill. If the browser did not open, go to:\n${started.url}\nWaiting…`,
      )
      await started.done
      const credits = await (await localIndexMySite())?.credits()
      if (jsonFlag(args))
        printJson({ status: 'connected', balance: credits?.balance ?? null })
      else
        write(
          `Index My Site is connected.${credits ? ` Balance: ${credits.balance} credits.` : ''} Send pages with \`seo submit <url> --indexmysite\`.`,
        )
    } catch (error) {
      throw localError(error)
    }
  },
})

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show the Index My Site connection' },
  args: { json },
  run: async ({ args }) => {
    try {
      const source = await localIndexMySiteSource()
      const credits = source
        ? await (await localIndexMySite())?.credits()
        : undefined
      const result = {
        connected: Boolean(source),
        source,
        balance: credits?.balance ?? null,
      }
      if (jsonFlag(args)) {
        printJson(result)
        return
      }
      write(
        source
          ? `Index My Site is connected (${source === 'machine' ? 'on this machine' : 'through your seoskill.dev account'}). Balance: ${credits?.balance ?? 'unknown'} credits.`
          : cloudLinked()
            ? `Index My Site is not connected. This machine uses your seoskill.dev account: connect it at ${cloudAccountUrl()}#indexmysite.`
            : 'Index My Site is not connected. Run `seo providers indexmysite connect`.',
      )
    } catch (error) {
      throw localError(error)
    }
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: "Remove this machine's Index My Site connection",
  },
  args: { json },
  run: async ({ args }) => {
    const removed = await disconnectLocalIndexMySite()
    if (!removed && cloudLinked()) {
      throw new SeoError(
        'INVALID_INPUT',
        `This machine uses your seoskill.dev account's Index My Site connection. Remove it at ${cloudAccountUrl()}#indexmysite.`,
      )
    }
    if (jsonFlag(args)) printJson({ disconnected: removed })
    else
      write(
        removed
          ? 'Index My Site is disconnected from this machine.'
          : 'Index My Site was not connected on this machine.',
      )
  },
})

export const indexMySiteProviderCommand = defineCommand({
  meta: {
    name: 'indexmysite',
    description: 'Connect Index My Site to send pages to Google (paid)',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
  },
})
