import { createKeywordSet, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../../args.js'
import { printJson, printKeyValue } from '../../../utils.js'
import {
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetCreateCommand = defineCommand({
  meta: { name: 'create', description: 'Create an empty saved keyword set' },
  args: {
    ...keywordSetProjectArgs,
    name: { type: 'string', description: 'Keyword set name.', required: true },
    country: {
      type: 'string',
      description: 'Two-letter country code.',
      required: true,
    },
    language: {
      type: 'string',
      description: 'Search language code.',
      required: true,
    },
    'search-engine': {
      type: 'string',
      default: 'google',
      description: 'Search engine: google or bing.',
    },
    'location-code': {
      type: 'string',
      description: 'Optional provider location code.',
    },
    location: {
      type: 'string',
      description: 'Optional canonical location name.',
    },
    device: {
      type: 'string',
      description: 'Optional device: desktop or mobile.',
    },
    provider: { type: 'string', description: 'Optional preferred provider.' },
    'source-report': {
      type: 'string',
      description: 'Report that produced the initial research.',
    },
    json: keywordSetJsonArg,
  },
  run: async ({ args }) => {
    const locationCode = numberArg(args['location-code'])
    if (locationCode !== undefined && !Number.isSafeInteger(locationCode)) {
      throw new SeoError('INVALID_INPUT', '--location-code must be an integer.')
    }
    const project = await selectedProject(args)
    const set = createKeywordSet({
      projectId: project.id,
      name: stringArg(args.name) ?? '',
      market: {
        searchEngine: stringArg(args['search-engine']),
        countryCode: stringArg(args.country),
        languageCode: stringArg(args.language),
        ...(locationCode !== undefined || stringArg(args.location)
          ? { location: { code: locationCode, name: stringArg(args.location) } }
          : {}),
        device: stringArg(args.device),
      },
      provider: stringArg(args.provider),
      sourceReport: stringArg(args['source-report']),
    })
    if (jsonFlag(args)) printJson(set)
    else
      printKeyValue([
        ['Created', set.name],
        ['Project', project.name],
        ['Keywords', '0'],
        ['Id', set.id],
      ])
  },
})
