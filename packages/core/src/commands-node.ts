import { type BingCall, bingCall } from './bing/api.js'
import type {
  Caller,
  CommandDeps,
  CommandErrorCode,
  IndexStatus,
} from './commands/index.js'
import {
  CommandError,
  checkPages,
  indexStatusFrom,
  matchProperty,
} from './commands/index.js'
import { SeoError, type SeoErrorCode } from './errors.js'
import type { GoogleFetch } from './google/api.js'
import {
  getAuthorized,
  googleFetchFor,
  LOCAL_SIGN_IN,
} from './gsc/client/fetch.js'
import { inspectUrl } from './gsc/client/inspection.js'
import { querySearchAnalytics } from './gsc/client/search-analytics.js'
import { listSites } from './gsc/client/sites.js'
import { readAhrefsApiKey } from './providers/ahrefs/credentials.js'
import { readBingApiKey } from './providers/bing/credentials.js'
import { readDataForSeoCredentials } from './providers/dataforseo/credentials.js'

// The core commands' functions for the CLI and the local MCP: Search Console
// with the local Google sign-in and cache, and live page checks from this
// machine.

export function nodeCommandDeps(options: {
  call: Caller
  account?: string
  refresh?: boolean
}): CommandDeps {
  return {
    searchAnalytics: (site, body) =>
      querySearchAnalytics(site, body, {
        refresh: options.refresh,
        accountEmail: options.account,
      }),
    checkPages,
    inspect: async (site, url): Promise<IndexStatus | null> => {
      try {
        return indexStatusFrom(
          await inspectUrl({
            siteUrl: site,
            inspectionUrl: url,
            accountEmail: options.account,
          }),
        )
      } catch {
        return null
      }
    },
    call: options.call,
    bing: localBing,
    bingConnect: LOCAL_BING_CONNECT,
  }
}

export const LOCAL_BING_CONNECT =
  'Run `seo providers bing connect` with an API key from Bing Webmaster Tools (Settings, API access).'

let bing: Promise<BingCall | null> | undefined

// Bing Webmaster calls with the saved API key, or null without one.
export function localBing(): Promise<BingCall | null> {
  bing ??= readBingApiKey()
    .catch(() => undefined)
    .then((key) =>
      key
        ? bingCall({ apiKey: key.apiKey }, { signIn: LOCAL_BING_CONNECT })
        : null,
    )
  return bing
}

// Provider keys from the local secret store, as header-style names. Keys go
// only to their provider.
export async function localResearchKeys(): Promise<Headers> {
  const [dataForSeo, ahrefs] = await Promise.all([
    readDataForSeoCredentials().catch(() => undefined),
    readAhrefsApiKey().catch(() => undefined),
  ])
  const keys = new Headers()
  if (dataForSeo) {
    keys.set('x-dataforseo-login', dataForSeo.login)
    keys.set('x-dataforseo-password', dataForSeo.password)
  }
  if (ahrefs?.apiKey) keys.set('x-ahrefs-key', ahrefs.apiKey)
  return keys
}

// The Search Console property this Google login can read that covers a site
// or URL.
export async function resolveLocalSite(
  site: string,
  options: { account?: string; refresh?: boolean } = {},
): Promise<string> {
  const names = (await listSites(options.refresh, options.account)).map(
    (entry) => entry.siteUrl,
  )
  const found = matchProperty(names, site)
  if (!found) {
    throw new CommandError(
      'NO_ACCESS',
      `This Google login has no Search Console property for ${site}. Run \`seo sites\` to list the properties it can read.`,
    )
  }
  return found
}

const ERROR_CODES: Record<CommandErrorCode, SeoErrorCode> = {
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_CONNECTED: 'AUTH_REQUIRED',
  NO_ACCESS: 'PROPERTY_NOT_FOUND',
  NO_KEY: 'AUTH_CONFIG_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  GOOGLE_ERROR: 'PROVIDER_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_UNAVAILABLE',
}

// A command error as the CLI and local MCP report errors; other errors pass
// through unchanged.
export function localError(error: unknown): unknown {
  return error instanceof CommandError
    ? new SeoError(ERROR_CODES[error.code], error.message)
    : error
}

// The shared Google API calls with this machine's Google sign-in.
export async function localGoogleFetch(account?: string): Promise<GoogleFetch> {
  const { client } = await getAuthorized(account)
  return googleFetchFor(client)
}

export { LOCAL_SIGN_IN }
