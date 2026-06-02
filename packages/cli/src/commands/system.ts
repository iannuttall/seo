import { rmSync } from 'node:fs'
import { cancel, confirm } from '@clack/prompts'
import {
  getCacheStats,
  getPrivacySnapshot,
  getSeoCliPaths,
  listSearchUpdates,
  listSites,
} from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../args.js'
import {
  formatBytes,
  maybeExitCancelled,
  printJson,
  printKeyValue,
  printTable,
} from '../utils.js'

export const privacyCommand = defineCommand({
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
  args: {
    yes: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const paths = getSeoCliPaths()
    const approved =
      args.yes ||
      maybeExitCancelled(
        await confirm({
          message: 'Delete config, tokens, cache, and logs?',
          initialValue: false,
        }),
      )
    if (!approved) {
      cancel('Reset aborted.')
      return
    }
    rmSync(paths.configDir, { recursive: true, force: true })
    rmSync(paths.cacheDir, { recursive: true, force: true })
    rmSync(paths.logDir, { recursive: true, force: true })
    process.stdout.write('Reset complete.\n')
  },
})

export const sitesCommand = defineCommand({
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
    printTable(
      ['Start', 'End', 'Type', 'Name', 'Status'],
      updates.map((update) => [
        update.start.slice(0, 10),
        update.end?.slice(0, 10) ?? 'open',
        update.type,
        update.name,
        update.status,
      ]),
    )
  },
})
