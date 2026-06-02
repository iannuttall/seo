import { monitoringStatus, technicalWatchWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import { startUrlForSite } from '../shared.js'
import { monitoringRunArgs, monitoringStatusArgs } from './args.js'
import { printMonitoringRun, printMonitoringStatus } from './output.js'

function quotedFlag(name: string, value: unknown): string | undefined {
  const text = stringArg(value)
  return text ? `--${name} ${JSON.stringify(text)}` : undefined
}

function booleanFlag(name: string, value: unknown): string | undefined {
  return booleanArg(value) ? `--${name}` : undefined
}

function recoverLinksFlag(value: unknown): string | undefined {
  return booleanArg(value) === false ? '--recover-links=false' : undefined
}

export const monitoringCommand = defineCommand({
  meta: {
    name: 'monitoring',
    description: 'Run and review recurring technical SEO monitoring',
  },
  subCommands: {
    run: defineCommand({
      meta: {
        name: 'run',
        description:
          'Run crawl, index, and link recovery monitoring for a property',
      },
      args: monitoringRunArgs(),
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const selection = await resolveClientSelection({
          client: stringArg(args.client),
          site: stringArg(args.site),
          options: { json, refresh: booleanArg(args.refresh) },
        })
        const urls = listArg(args.urls)
        const sitemaps = listArg(args.sitemaps)
        const startUrl =
          stringArg(args.url) ??
          selection.client?.startUrl ??
          startUrlForSite(selection.site)
        const report = await technicalWatchWorkflow({
          site: selection.site,
          startUrl,
          urls: urls.length ? urls : selection.client?.watchUrls,
          sitemaps: sitemaps.length ? sitemaps : undefined,
          properties: listArg(args.properties).length
            ? listArg(args.properties)
            : undefined,
          limit: numberArg(args.limit),
          languageCode: stringArg(args.language),
          dailyLimit: numberArg(args['daily-limit']),
          inspectLimit: numberArg(args['inspect-limit']),
          maxUrls: numberArg(args['max-urls']),
          refresh: booleanArg(args.refresh),
          js: booleanArg(args.js) ? true : 'auto',
          recoverLinks: booleanArg(args['recover-links']),
          recoverDays: numberArg(args['recover-days']),
          recoverLimit: numberArg(args['recover-limit']),
          recoverMinClicks: numberArg(args['recover-min-clicks']),
          recoverMinImpressions: numberArg(args['recover-min-impressions']),
        })

        if (json) {
          printJson(report)
          return
        }
        printMonitoringRun(report)
      },
    }),
    status: defineCommand({
      meta: {
        name: 'status',
        description: 'Show the latest saved monitoring state for a property',
      },
      args: monitoringStatusArgs(),
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const selection = await resolveClientSelection({
          client: stringArg(args.client),
          site: stringArg(args.site),
          options: { json, refresh: booleanArg(args.refresh) },
        })
        const report = monitoringStatus({
          site: selection.site,
          staleAfterDays: numberArg(args['stale-days']),
        })
        if (json) {
          printJson(report)
          return
        }
        printMonitoringStatus(report)
      },
    }),
    cron: defineCommand({
      meta: {
        name: 'cron',
        description: 'Print a local cron line for recurring monitoring',
      },
      args: {
        ...monitoringRunArgs(),
        hour: {
          type: 'string',
          default: '9',
          description: 'Hour in local cron time. Defaults to 9.',
        },
        minute: {
          type: 'string',
          default: '0',
          description: 'Minute in local cron time. Defaults to 0.',
        },
        weekday: {
          type: 'string',
          description:
            'Weekly monitoring day. Defaults to client setting, then Monday.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const selection = await resolveClientSelection({
          client: stringArg(args.client),
          site: stringArg(args.site),
          options: { json, refresh: booleanArg(args.refresh) },
        })
        const hour = numberArg(args.hour) ?? 9
        const minute = numberArg(args.minute) ?? 0
        const weekday =
          numberArg(args.weekday) ?? selection.client?.technicalWeekday ?? 1
        const identityArg = selection.client
          ? `--client ${JSON.stringify(selection.client.id)}`
          : `--site ${JSON.stringify(selection.site)}`
        const command = [
          'seo monitoring run',
          identityArg,
          quotedFlag('url', args.url),
          quotedFlag('urls', args.urls),
          quotedFlag('sitemaps', args.sitemaps),
          quotedFlag('properties', args.properties),
          quotedFlag('limit', args.limit),
          quotedFlag('daily-limit', args['daily-limit']),
          quotedFlag('inspect-limit', args['inspect-limit']),
          quotedFlag('max-urls', args['max-urls']),
          quotedFlag('language', args.language),
          quotedFlag('recover-days', args['recover-days']),
          quotedFlag('recover-limit', args['recover-limit']),
          quotedFlag('recover-min-clicks', args['recover-min-clicks']),
          quotedFlag(
            'recover-min-impressions',
            args['recover-min-impressions'],
          ),
          recoverLinksFlag(args['recover-links']),
          booleanFlag('refresh', args.refresh),
          booleanFlag('js', args.js),
          '--json',
        ]
          .filter(Boolean)
          .join(' ')
        const line = {
          name: 'monitoring',
          cron: `${minute} ${hour} * * ${weekday}`,
          command,
        }

        if (json) {
          printJson({ site: selection.site, line })
          return
        }
        printKeyValue([
          ['Property', selection.site],
          ['Install', 'crontab -e'],
        ])
        process.stdout.write(`${line.cron} ${line.command}\n`)
      },
    }),
  },
})
