import {
  booleanArg,
  fetchRateArg,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { cliReportArgs } from '../report-options.js'

export const reportSelectionArgs = {
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
} as const

export const reportFetchArgs = {
  ...cliReportArgs([
    'includeBrand',
    'verifyContent',
    'verifyLimit',
    'js',
    'fetchConcurrency',
    'fetchIntervalCap',
    'fetchIntervalMs',
    'refresh',
  ]),
  json: {
    type: 'boolean',
    default: false,
    description: 'Print machine-readable JSON.',
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
    client: projectArg(args),
    site: stringArg(args.site),
    refresh: booleanArg(args.refresh),
  }
}
