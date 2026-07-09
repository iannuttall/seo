import type { ArgDef } from 'citty'

// Shared report option metadata used by CLI commands. The parity check keeps
// this aligned with scripts/report-surface-catalog.mjs.
type CliReportOption = {
  cli: string
  arg: ArgDef
}

const REPORT_OPTIONS = {
  days: {
    cli: 'days',
    arg: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 28.',
    },
  },
  recentDays: {
    cli: 'recent',
    arg: {
      type: 'string',
      description: 'Recent anomaly window in days. Defaults to 14.',
    },
  },
  range: {
    cli: 'days',
    arg: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 28.',
    },
  },
  limit: {
    cli: 'limit',
    arg: {
      type: 'string',
      description: 'Maximum rows to return.',
    },
  },
  checkLimit: {
    cli: 'check-limit',
    arg: {
      type: 'string',
      description: 'Maximum candidate pages to fetch and check.',
    },
  },
  minImpressions: {
    cli: 'min-impressions',
    arg: {
      type: 'string',
      description: 'Minimum query impressions.',
    },
  },
  includeBrand: {
    cli: 'include-brand',
    arg: {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
  },
  verifyContent: {
    cli: 'verify-content',
    arg: {
      type: 'boolean',
      default: false,
      description:
        'Verify top opportunities against page title, meta, and content.',
    },
  },
  verifyLimit: {
    cli: 'verify-limit',
    arg: {
      type: 'string',
      description: 'Maximum opportunity URLs to verify.',
    },
  },
  js: {
    cli: 'js',
    arg: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for verified pages.',
    },
  },
  fetchConcurrency: {
    cli: 'fetch-concurrency',
    arg: {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
  },
  fetchIntervalCap: {
    cli: 'fetch-interval-cap',
    arg: {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
  },
  fetchIntervalMs: {
    cli: 'fetch-interval-ms',
    arg: {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
    },
  },
  refresh: {
    cli: 'refresh',
    arg: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh data.',
    },
  },
} as const satisfies Record<string, CliReportOption>

type ReportOptionKey = keyof typeof REPORT_OPTIONS

export function cliReportArgs<const T extends readonly ReportOptionKey[]>(
  keys: T,
  overrides: Partial<Record<ReportOptionKey, Partial<ArgDef>>> = {},
): Record<(typeof REPORT_OPTIONS)[T[number]]['cli'], ArgDef> {
  return Object.fromEntries(
    keys.map((key) => {
      const option = REPORT_OPTIONS[key]
      return [option.cli, { ...option.arg, ...overrides[key] }]
    }),
  ) as Record<(typeof REPORT_OPTIONS)[T[number]]['cli'], ArgDef>
}
