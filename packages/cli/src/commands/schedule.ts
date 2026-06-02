import { ensureSeoCliDirs } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue } from '../utils.js'
import { startUrlForSite } from './shared.js'

function quote(value: string): string {
  return JSON.stringify(value)
}

export const scheduleCommand = defineCommand({
  meta: {
    name: 'schedule',
    description: 'Print local cron entries for recurring SEO workflows',
  },
  subCommands: {
    cron: defineCommand({
      meta: {
        name: 'cron',
        description: 'Print crontab lines for local recurring SEO workflows',
      },
      args: {
        site: {
          type: 'string',
          description: 'GSC property URL, for example sc-domain:example.com.',
        },
        client: {
          type: 'string',
          description: 'Saved client id or name.',
        },
        url: {
          type: 'string',
          description:
            'Start URL for technical-watch. Defaults from the GSC property when possible.',
        },
        urls: {
          type: 'string',
          description: 'Comma-separated URLs for index-watch.',
        },
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
            'Weekly technical-watch day. Defaults to client setting, then Monday.',
        },
        day: {
          type: 'string',
          description:
            'Monthly report day. Defaults to client setting, then 1.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const selection = await resolveClientSelection({
          client: stringArg(args.client),
          site: stringArg(args.site),
          options: { json },
        })
        const site = selection.site
        const startUrl =
          stringArg(args.url) ??
          selection.client?.startUrl ??
          startUrlForSite(selection.site)
        const hour = numberArg(args.hour) ?? 9
        const minute = numberArg(args.minute) ?? 0
        const weekday =
          numberArg(args.weekday) ?? selection.client?.technicalWeekday ?? 1
        const day = numberArg(args.day) ?? selection.client?.reportDay ?? 1
        const identityArg = selection.client
          ? `--client ${quote(selection.client.id)}`
          : `--site ${quote(site)}`
        const watchUrls =
          stringArg(args.urls) ?? selection.client?.watchUrls.join(',')

        const lines = [
          {
            name: 'technical-watch',
            cron: `${minute} ${hour} * * ${weekday}`,
            command: [
              'seo technical-watch',
              identityArg,
              startUrl ? `--url ${quote(startUrl)}` : undefined,
              watchUrls ? `--urls ${quote(watchUrls)}` : undefined,
              '--json',
            ]
              .filter(Boolean)
              .join(' '),
          },
          {
            name: 'monthly-report',
            cron: `${minute} ${hour} ${day} * *`,
            command: ['seo monthly-report', identityArg, '--json'].join(' '),
          },
        ]

        if (json) {
          printJson({ site, lines })
          return
        }

        const paths = ensureSeoCliDirs()
        printKeyValue([
          ['Property', site],
          ['Install', 'crontab -e'],
        ])
        for (const line of lines) {
          process.stdout.write(
            `${line.cron} ${line.command} >> ${quote(`${paths.logDir}/${line.name}.log`)} 2>&1\n`,
          )
        }
      },
    }),
  },
})
