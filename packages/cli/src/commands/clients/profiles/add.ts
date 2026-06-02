import { saveClient } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../../args.js'
import { resolveSite } from '../../../selection.js'
import { printJson } from '../../../utils.js'
import { printClientProfile } from './output.js'

export const clientAddCommand = defineCommand({
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
      description: 'Comma-separated branded query terms to exclude by default.',
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
    printClientProfile(client)
  },
})
