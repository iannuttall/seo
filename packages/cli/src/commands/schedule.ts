import { ensureSeoCliDirs, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, listArg, numberArg, projectArg, stringArg } from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue } from '../utils.js'
import { startUrlForSite } from './shared.js'

function quote(value: string): string {
  return JSON.stringify(value)
}

type RankCronCadence = 'daily' | 'weekly' | 'monthly'

export function rankTrackingCronLine(input: {
  projectId: string
  set: string
  targetDomain: string
  tag?: string
  devices?: string[]
  depth?: number
  keywordLimit?: number
  provider?: string
  cadence?: string
  hour: number
  minute: number
  weekday: number
  day: number
}) {
  const cadence = (input.cadence ?? 'weekly') as RankCronCadence
  if (!['daily', 'weekly', 'monthly'].includes(cadence)) {
    throw new SeoError(
      'INVALID_INPUT',
      'Rank tracking cron cadence must be daily, weekly, or monthly.',
    )
  }
  const devices = input.devices?.length
    ? [...new Set(input.devices)]
    : undefined
  if (
    devices?.some((device) => !['desktop', 'mobile'].includes(device)) ||
    (devices?.length ?? 0) > 2
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Rank tracking devices must be desktop, mobile, or both.',
    )
  }
  if (
    input.depth !== undefined &&
    (!Number.isSafeInteger(input.depth) || input.depth < 1 || input.depth > 100)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Rank tracking depth must be from 1 to 100.',
    )
  }
  if (
    input.keywordLimit !== undefined &&
    (!Number.isSafeInteger(input.keywordLimit) ||
      input.keywordLimit < 1 ||
      input.keywordLimit > 1_000)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Queued rank tracking can collect 1 to 1000 keywords per run.',
    )
  }
  const params = {
    projectId: input.projectId,
    set: input.set,
    targetDomain: input.targetDomain,
    ...(input.tag ? { tag: input.tag } : {}),
    ...(devices ? { devices } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    collectionMethod: 'queued',
    cadence,
    ...(input.depth === undefined ? {} : { depth: input.depth }),
    ...(input.keywordLimit === undefined
      ? {}
      : { keywordLimit: input.keywordLimit }),
    start: true,
  }
  return {
    name: 'rank-tracking',
    cron: `${input.minute} ${input.hour} * * *`,
    command: [
      'seo reports run rank-tracking',
      `--params ${quote(JSON.stringify(params))}`,
      '--json',
    ].join(' '),
  }
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
          description: 'Legacy alias for --project.',
        },
        project: {
          type: 'string',
          description: 'Saved project id or name.',
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
        'rank-set': {
          type: 'string',
          description:
            'Saved keyword set to collect with the rank-tracking report.',
        },
        'rank-domain': {
          type: 'string',
          description: 'Target domain for exact rank matching.',
        },
        'rank-tag': {
          type: 'string',
          description: 'Optional saved keyword tag to track.',
        },
        'rank-devices': {
          type: 'string',
          description: 'Comma-separated desktop and mobile devices.',
        },
        'rank-depth': {
          type: 'string',
          description: 'Organic result depth from 1 to 100.',
        },
        'rank-limit': {
          type: 'string',
          description: 'Maximum saved keywords from 1 to 1000.',
        },
        'rank-provider': {
          type: 'string',
          description: 'Connected provider for exact rank collection.',
        },
        'rank-cadence': {
          type: 'string',
          description: 'Rank collection cadence: daily, weekly, or monthly.',
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
          client: projectArg(args),
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
          ? `--project ${quote(selection.client.id)}`
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
        const rankSet = stringArg(args['rank-set'])
        const rankDomain = stringArg(args['rank-domain'])
        if (rankSet || rankDomain) {
          if (!rankSet || !rankDomain) {
            throw new SeoError(
              'INVALID_INPUT',
              'Pass both --rank-set and --rank-domain for scheduled rank tracking.',
            )
          }
          if (!selection.client) {
            throw new SeoError(
              'INVALID_INPUT',
              'Scheduled rank tracking needs a saved project profile.',
            )
          }
          lines.push(
            rankTrackingCronLine({
              projectId: selection.client.id,
              set: rankSet,
              targetDomain: rankDomain,
              tag: stringArg(args['rank-tag']),
              devices: listArg(args['rank-devices']),
              depth: numberArg(args['rank-depth']),
              keywordLimit: numberArg(args['rank-limit']),
              provider: stringArg(args['rank-provider']),
              cadence: stringArg(args['rank-cadence']),
              hour,
              minute,
              weekday,
              day,
            }),
          )
        }

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
            `${line.cron} seo logs prune --quiet; ${line.command} >> ${quote(`${paths.logDir}/${line.name}.log`)} 2>&1\n`,
          )
        }
      },
    }),
  },
})
