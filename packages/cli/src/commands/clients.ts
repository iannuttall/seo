import {
  deleteClient,
  detectBrandTerms,
  getClient,
  listClients,
  saveClient,
  setDefaultClient,
} from '@seo/core'
import { defineCommand } from 'citty'
import { resolveSite } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { clientSetupCommand } from './setup.js'

const stringArg = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const numberArg = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const jsonFlag = (args: Record<string, unknown>): boolean => args.json === true

function urlList(value: unknown): string[] {
  const raw = stringArg(value)
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const clientCommand = defineCommand({
  meta: {
    name: 'client',
    description: 'Manage saved SEO client profiles',
  },
  subCommands: {
    setup: clientSetupCommand,
    brand: defineCommand({
      meta: {
        name: 'brand',
        description: 'Detect and manage client brand query terms',
      },
      subCommands: {
        detect: defineCommand({
          meta: {
            name: 'detect',
            description:
              'Suggest branded query terms from GSC navigational queries',
          },
          args: {
            client: {
              type: 'string',
              description: 'Saved client id or name. Defaults to default.',
            },
            site: {
              type: 'string',
              description:
                'GSC property URL, for example sc-domain:example.com.',
            },
            days: {
              type: 'string',
              description: 'Detection window length in days. Defaults to 28.',
            },
            limit: {
              type: 'string',
              description: 'Maximum candidate terms. Defaults to 10.',
            },
            'min-impressions': {
              type: 'string',
              description: 'Minimum query impressions. Defaults to 10.',
            },
            save: {
              type: 'boolean',
              default: false,
              description: 'Save suggested terms to the selected client.',
            },
            json: {
              type: 'boolean',
              default: false,
              description: 'Print machine-readable JSON.',
            },
            refresh: {
              type: 'boolean',
              default: false,
              description: 'Bypass local GSC cache.',
            },
          },
          run: async ({ args }) => {
            const json = jsonFlag(args)
            const client = getClient(stringArg(args.client))
            const siteUrl = await resolveSite({
              site: stringArg(args.site) ?? client?.siteUrl,
              options: { json, refresh: booleanArg(args.refresh) },
            })
            const detection = await detectBrandTerms({
              site: siteUrl,
              id: client?.id,
              name: client?.name,
              days: numberArg(args.days),
              limit: numberArg(args.limit),
              minImpressions: numberArg(args['min-impressions']),
              refresh: booleanArg(args.refresh),
            })
            const saved =
              booleanArg(args.save) && client
                ? saveClient({
                    id: client.id,
                    name: client.name,
                    siteUrl: client.siteUrl,
                    startUrl: client.startUrl,
                    watchUrls: client.watchUrls,
                    ga4PropertyId: client.ga4PropertyId,
                    brandTerms: detection.suggestedTerms,
                    reportDay: client.reportDay,
                    technicalWeekday: client.technicalWeekday,
                    isDefault: client.isDefault,
                  })
                : undefined

            if (booleanArg(args.save) && !client) {
              throw new Error('Pass --client to save detected brand terms.')
            }
            if (json) {
              printJson({ ...detection, saved })
              return
            }

            printKeyValue([
              ['Property', detection.site],
              ['Derived terms', detection.derivedTerms.join(', ')],
              ['Suggested terms', detection.suggestedTerms.join(', ')],
              ['Saved', saved ? saved.id : 'no'],
            ])
            printTable(
              ['Term', 'Score', 'Evidence'],
              detection.candidates.map((candidate) => [
                candidate.term,
                candidate.score,
                candidate.evidence
                  .map(
                    (item) =>
                      `${item.query} (${Math.round(item.clicks)} clicks)`,
                  )
                  .join(', '),
              ]),
            )
          },
        }),
      },
    }),
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List saved clients',
      },
      args: {
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const clients = listClients()
        if (jsonFlag(args)) {
          printJson({ clients })
          return
        }
        printTable(
          [
            'Default',
            'ID',
            'Name',
            'GSC property',
            'Crawl URL',
            'Watch URLs',
            'Brand terms',
          ],
          clients.map((client) => [
            client.isDefault ? 'yes' : '',
            client.id,
            client.name,
            client.siteUrl,
            client.startUrl ?? '',
            client.watchUrls.length,
            client.brandTerms.join(', '),
          ]),
        )
      },
    }),
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Create or update a client profile',
      },
      args: {
        id: {
          type: 'string',
          description: 'Short stable client id, for example acme.',
        },
        name: {
          type: 'string',
          description: 'Human client name.',
        },
        site: {
          type: 'string',
          description: 'GSC property URL, for example sc-domain:example.com.',
        },
        url: {
          type: 'string',
          description: 'Default technical crawl start URL.',
        },
        urls: {
          type: 'string',
          description: 'Comma-separated URLs to watch with URL Inspection.',
        },
        ga4: {
          type: 'string',
          description: 'Optional GA4 property ID for this client.',
        },
        brand: {
          type: 'string',
          description:
            'Comma-separated branded query terms to exclude by default.',
        },
        'report-day': {
          type: 'string',
          description: 'Preferred monthly report day, 1-31.',
        },
        weekday: {
          type: 'string',
          description: 'Preferred technical-watch weekday, 0-7.',
        },
        default: {
          type: 'boolean',
          description: 'Make this the default client.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const client = saveClient({
          id: stringArg(args.id),
          name: stringArg(args.name),
          siteUrl: await resolveSite({
            site: stringArg(args.site),
            options: { json },
          }),
          startUrl: stringArg(args.url),
          watchUrls: urlList(args.urls),
          brandTerms: urlList(args.brand),
          ga4PropertyId: stringArg(args.ga4),
          reportDay: numberArg(args['report-day']),
          technicalWeekday: numberArg(args.weekday),
          isDefault: booleanArg(args.default),
        })
        if (json) {
          printJson(client)
          return
        }
        printKeyValue([
          ['ID', client.id],
          ['Name', client.name],
          ['GSC property', client.siteUrl],
          ['Crawl URL', client.startUrl ?? 'not set'],
          ['Watch URLs', String(client.watchUrls.length)],
          ['Brand terms', client.brandTerms.join(', ') || 'not set'],
          ['GA4 property', client.ga4PropertyId ?? 'not set'],
          ['Default', client.isDefault ? 'yes' : 'no'],
        ])
      },
    }),
    show: defineCommand({
      meta: {
        name: 'show',
        description: 'Show one client profile',
      },
      args: {
        id: {
          type: 'string',
          description: 'Client id or name. Defaults to the default client.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const client = getClient(stringArg(args.id))
        if (!client) throw new Error('Client not found.')
        if (jsonFlag(args)) {
          printJson(client)
          return
        }
        printKeyValue([
          ['ID', client.id],
          ['Name', client.name],
          ['GSC property', client.siteUrl],
          ['Crawl URL', client.startUrl ?? 'not set'],
          ['Watch URLs', client.watchUrls.join(', ') || 'not set'],
          ['Brand terms', client.brandTerms.join(', ') || 'not set'],
          ['GA4 property', client.ga4PropertyId ?? 'not set'],
          [
            'Report day',
            client.reportDay ? String(client.reportDay) : 'not set',
          ],
          [
            'Technical weekday',
            client.technicalWeekday === undefined
              ? 'not set'
              : String(client.technicalWeekday),
          ],
          ['Default', client.isDefault ? 'yes' : 'no'],
        ])
      },
    }),
    default: defineCommand({
      meta: {
        name: 'default',
        description: 'Set the default client',
      },
      args: {
        id: {
          type: 'string',
          required: true,
          description: 'Client id or name.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const client = setDefaultClient(stringArg(args.id) ?? '')
        if (jsonFlag(args)) {
          printJson(client)
          return
        }
        process.stdout.write(`Default client set to ${client.id}.\n`)
      },
    }),
    delete: defineCommand({
      meta: {
        name: 'delete',
        description: 'Delete a client profile',
      },
      args: {
        id: {
          type: 'string',
          required: true,
          description: 'Client id or name.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const id = stringArg(args.id) ?? ''
        const deleted = deleteClient(id)
        if (jsonFlag(args)) {
          printJson({ id, deleted })
          return
        }
        process.stdout.write(`${deleted ? 'Deleted' : 'Not found'} ${id}.\n`)
      },
    }),
  },
})
