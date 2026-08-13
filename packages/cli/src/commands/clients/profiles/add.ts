import { getClient, SeoError, saveClient, updateClient } from '@seo/core'
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
import { slugId } from '../../shared.js'
import { printClientProfile } from './output.js'

export const clientAddCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Create or update a project profile',
  },
  args: {
    id: {
      type: 'string',
      description: 'Short stable project id, for example acme.',
    },
    name: {
      type: 'string',
      description: 'Human project name.',
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
    'google-analytics-property': {
      type: 'string',
      description: 'Optional Google Analytics property ID for this project.',
    },
    'clicky-site-id': {
      type: 'string',
      description:
        'Optional legacy Clicky site ID. New connections use seo start.',
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
      description: 'Make this the default project.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const requestedId = stringArg(args.id)
    const existing = requestedId
      ? (getClient(requestedId) ?? getClient(slugId(requestedId)))
      : undefined
    const googleAnalyticsProperty = stringArg(args['google-analytics-property'])
    const clickySiteId = stringArg(args['clicky-site-id'])
    if (googleAnalyticsProperty && clickySiteId) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass either --google-analytics-property or --clicky-site-id, not both.',
      )
    }
    const siteUrl = await resolveSite({
      site: stringArg(args.site) ?? existing?.siteUrl,
      options: { json },
    })
    const profile = {
      name: stringArg(args.name),
      siteUrl,
      startUrl: stringArg(args.url),
      watchUrls: args.urls === undefined ? undefined : listArg(args.urls),
      brandTerms: args.brand === undefined ? undefined : listArg(args.brand),
      analytics: googleAnalyticsProperty
        ? {
            ...existing?.analytics,
            selected: 'google' as const,
            google: {
              propertyId: googleAnalyticsProperty,
            },
          }
        : clickySiteId
          ? {
              ...existing?.analytics,
              selected: 'clicky' as const,
              clicky: { siteId: clickySiteId },
            }
          : undefined,
      reportDay: numberArg(args['report-day']),
      technicalWeekday: numberArg(args.weekday),
      isDefault: booleanArg(args.default),
    }
    const client = existing
      ? updateClient(existing.id, profile)
      : saveClient({ id: requestedId, ...profile })
    if (json) {
      printJson(client)
      return
    }
    printClientProfile(client)
  },
})
