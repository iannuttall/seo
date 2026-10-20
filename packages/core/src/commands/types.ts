import type { BingCall } from '../bing/api.js'
import { SeoError, type SeoErrorCode } from '../errors.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import type { AnalyticsAccess } from './analytics-site.js'

// The eight public commands. Each runs the same core code in the CLI, the
// local MCP and the hosted MCP; only the functions that reach Google and the
// web differ. "local" commands need the person's machine (a crawl).

export const COMMANDS = {
  report: {
    where: 'anywhere',
    summary:
      'The main report: overview plus quick wins, low CTR, striking distance, second page, content decay, cannibalization and traffic drops.',
  },
  page: {
    where: 'anywhere',
    summary:
      'One URL: live page facts, Google index status and its queries against the previous period.',
  },
  compare: {
    where: 'anywhere',
    summary:
      'Equal periods before and after a date, for the site or some URLs, with Google Analytics sessions and Google updates.',
  },
  index: {
    where: 'anywhere',
    summary:
      'Pages that lost most of their clicks, checked live and with URL Inspection.',
  },
  research: {
    where: 'anywhere',
    summary:
      'Keyword metrics, ranked keywords, SERPs, competitors and backlinks from DataForSEO or Ahrefs.',
  },
  data: {
    where: 'anywhere',
    summary: 'Raw Search Console or analytics rows.',
  },
  crawl: {
    where: 'local',
    summary: 'Crawl a site and list technical issues and affected URLs.',
  },
  'internal-links': {
    where: 'local',
    summary: 'Pages that could link to a target page.',
  },
} as const

export type CommandId = keyof typeof COMMANDS

// How a surface writes "run this next": `seo page <url>` in the CLI,
// `seo_page with url "<url>"` in an MCP client.
export type Caller = (
  command: CommandId,
  args?: Record<string, string | number | undefined>,
) => string

export type DateRange = { startDate: string; endDate: string }

export type PageFacts = {
  url: string
  status: number | null
  redirects_to: string | null
  title: string | null
  description: string | null
  h1: string | null
  canonical: string | null
  robots: string | null
  error?: string
}

export type IndexStatus = {
  verdict: string | null
  coverage: string | null
  indexing: string | null
  last_crawl: string | null
  google_canonical: string | null
  user_canonical: string | null
}

export type CommandErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_CONNECTED'
  | 'NO_ACCESS'
  | 'NO_KEY'
  | 'RATE_LIMITED'
  | 'GOOGLE_ERROR'
  | 'PROVIDER_ERROR'

export class CommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
  ) {
    super(message)
  }
}

// What a command needs from its surface.
export type CommandDeps = {
  // Search Console rows for a property.
  searchAnalytics: SearchAnalyticsQuery
  // Live facts for up to 20 URLs, one request each, no redirects followed.
  checkPages: (urls: string[]) => Promise<PageFacts[]>
  // Google's index status for one URL, or null when it cannot be read.
  inspect: (site: string, url: string) => Promise<IndexStatus | null>
  // One page's main content as Markdown, read live. Only where the
  // extraction packages run (the CLI and the local MCP server).
  pageMarkdown?: (url: string) => Promise<PageMarkdown>
  call: Caller
  // Bing Webmaster calls, or null when Bing is not connected here. Each
  // surface returns the same call each time.
  bing?: () => Promise<BingCall | null>
  // How to connect Bing on this surface, for "not connected" notes.
  bingConnect?: string
  // The Google sign-ins that can read Google Analytics. The report and
  // compare show the matching property's sessions beside Search Console.
  analytics?: AnalyticsAccess
  now?: () => Date
}

export type CommandResult = { text: string; data: unknown }

export type PageMarkdown =
  | { markdown: string; characters: number; truncated: boolean }
  | { error: string }

const FROM_SEO: Partial<Record<SeoErrorCode, CommandErrorCode>> = {
  AUTH_EXPIRED: 'NOT_CONNECTED',
  AUTH_REQUIRED: 'NOT_CONNECTED',
  ACCESS_DENIED: 'NO_ACCESS',
  PROPERTY_NOT_FOUND: 'NO_ACCESS',
  AUTH_CONFIG_REQUIRED: 'NO_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_INPUT: 'INVALID_INPUT',
  PROVIDER_UNAVAILABLE: 'GOOGLE_ERROR',
  OPTIONAL_PROVIDER_UNAVAILABLE: 'PROVIDER_ERROR',
}

// A core error as a command error, so MCP surfaces report both the same way.
// Other errors pass through unchanged.
export function commandErrorFrom(error: unknown): unknown {
  if (error instanceof CommandError || !(error instanceof SeoError)) {
    return error
  }
  const code = FROM_SEO[error.code]
  return code ? new CommandError(code, error.message) : error
}
