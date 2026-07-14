import { rmSync } from 'node:fs'
import { cancel, confirm } from '@clack/prompts'
import {
  deleteTokens,
  getCacheStats,
  getPrivacySnapshot,
  getSeoCliPaths,
  listSearchUpdates,
  listSites,
  SeoError,
} from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../args.js'
import {
  canPrompt,
  formatBytes,
  maybeExitCancelled,
  printJson,
  printKeyValue,
  printSummaryList,
  printTable,
} from '../utils.js'

export const privacyCommand = defineCommand({
  meta: {
    name: 'privacy',
    description: 'Show local config, token, cache, and log storage paths',
  },
  run: async () => {
    const snapshot = getPrivacySnapshot()
    const stats = getCacheStats()
    printKeyValue(
      snapshot.map((item) => [
        item.label,
        `${item.path} · ${formatBytes(item.sizeBytes)} · ${item.mode}`,
      ]),
    )
    process.stdout.write('\n')
    printKeyValue(
      Object.entries(stats.counts).map(([key, value]) => [key, String(value)]),
    )
  },
})

export const resetCommand = defineCommand({
  meta: {
    name: 'reset',
    description: 'Delete local seo config, tokens, cache, and logs',
  },
  args: {
    yes: {
      type: 'boolean',
      default: false,
      description: 'Confirm deletion without prompting.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const paths = getSeoCliPaths()
    const json = jsonFlag(args)
    if (!args.yes && !canPrompt({ json })) {
      throw new SeoError(
        'INVALID_INPUT',
        'Cannot prompt here. Pass --yes to confirm reset.',
      )
    }
    const approved = args.yes
      ? true
      : maybeExitCancelled(
          await confirm({
            message: 'Delete config, tokens, cache, and logs?',
            initialValue: false,
          }),
        )
    if (!approved) {
      cancel('Reset aborted.')
      return
    }
    await deleteTokens()
    rmSync(paths.configDir, { recursive: true, force: true })
    rmSync(paths.cacheDir, { recursive: true, force: true })
    rmSync(paths.logDir, { recursive: true, force: true })
    if (json) {
      printJson({ reset: true })
    } else {
      process.stdout.write('Reset complete.\n')
    }
  },
})

export const sitesCommand = defineCommand({
  meta: {
    name: 'sites',
    description:
      'List Search Console properties available to this Google login',
  },
  args: {
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const sites = await listSites(booleanArg(args.refresh))
    if (jsonFlag(args)) {
      printJson({ sites })
      return
    }
    printTable(
      ['Property', 'Permission'],
      sites.map((site) => [site.siteUrl, site.permissionLevel ?? 'unknown']),
    )
  },
})

export const updatesCommand = defineCommand({
  meta: {
    name: 'updates',
    description: 'List official Google Search Status ranking updates',
  },
  args: {
    product: { type: 'string', default: 'Ranking' },
    limit: { type: 'string', default: '10' },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const updates = await listSearchUpdates({
      product: stringArg(args.product),
      limit: numberArg(args.limit),
    })
    if (jsonFlag(args)) {
      printJson({ updates })
      return
    }
    printSummaryList(
      updates.map((update) => ({
        title: update.name,
        meta: [
          update.type,
          update.status,
          `${update.start.slice(0, 10)} to ${update.end?.slice(0, 10) ?? 'present'}`,
        ],
      })),
      { empty: 'No matching Google Search updates.' },
    )
  },
})
