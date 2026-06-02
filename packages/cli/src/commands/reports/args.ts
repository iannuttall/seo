import { booleanArg, fetchRateArg, numberArg, stringArg } from '../../args.js'

export const reportSelectionArgs = {
  site: {
    type: 'string',
    description: 'GSC property URL, for example sc-domain:example.com.',
  },
  client: {
    type: 'string',
    description: 'Saved client id or name.',
  },
} as const

export const reportFetchArgs = {
  'include-brand': {
    type: 'boolean',
    default: false,
    description: 'Include branded queries in opportunity reports.',
  },
  'verify-content': {
    type: 'boolean',
    default: false,
    description: 'Verify top quick wins against page title, meta, and content.',
  },
  'verify-limit': {
    type: 'string',
    description: 'Maximum quick-win URLs to verify. Defaults to 3.',
  },
  js: {
    type: 'boolean',
    default: false,
    description: 'Force JavaScript rendering for verified pages.',
  },
  'fetch-concurrency': {
    type: 'string',
    description: 'Maximum concurrent page fetches per host. Defaults to 4.',
  },
  'fetch-interval-cap': {
    type: 'string',
    description: 'Maximum page fetches per interval per host. Defaults to 4.',
  },
  'fetch-interval-ms': {
    type: 'string',
    description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
  },
  json: {
    type: 'boolean',
    default: false,
    description: 'Print machine-readable JSON.',
  },
  refresh: {
    type: 'boolean',
    default: false,
    description: 'Bypass local cache and fetch fresh GSC data.',
  },
} as const

export function reportFetchOptions(args: Record<string, unknown>) {
  return {
    includeBrand: booleanArg(args['include-brand']),
    verifyContent: booleanArg(args['verify-content']),
    verifyLimit: numberArg(args['verify-limit']) ?? 3,
    js: booleanArg(args.js) ? true : undefined,
    rate: fetchRateArg(args),
    refresh: booleanArg(args.refresh),
  }
}

export function reportSelectionInput(args: Record<string, unknown>) {
  return {
    client: stringArg(args.client),
    site: stringArg(args.site),
    refresh: booleanArg(args.refresh),
  }
}
