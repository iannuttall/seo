import {
  deleteClient,
  getClient,
  listClients,
  saveClient,
  setDefaultClient,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveSite } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

export const clientProfileCommands = {
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
        watchUrls: listArg(args.urls),
        brandTerms: listArg(args.brand),
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
        ['Report day', client.reportDay ? String(client.reportDay) : 'not set'],
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
}
