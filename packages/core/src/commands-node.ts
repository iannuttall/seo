import { type BingCall, bingCall } from './bing/api.js'
import { readClickySiteKeys } from './clicky/credentials.js'
import {
  cloudBing,
  cloudGoogleEmails,
  cloudGoogleToken,
  cloudKeys,
  cloudLinked,
} from './cloud.js'
import type {
  Caller,
  CommandDeps,
  CommandErrorCode,
  GoogleAccount,
  IndexStatus,
} from './commands/index.js'
import {
  CLICKY_KEY_PREFIX,
  CommandError,
  checkPages,
  indexStatusFrom,
  matchProperty,
} from './commands/index.js'
import { SeoError, type SeoErrorCode } from './errors.js'
import { bearerFetch, type GoogleFetch } from './google/api.js'
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
  'Connect Bing on your seoskill.dev account and run `seo login`, or run `seo providers bing connect` with an API key from Bing Webmaster Tools (Settings, API access).'

let bing: Promise<BingCall | null> | undefined

// Bing Webmaster calls with the saved API key, else the seoskill.dev
// account's Bing sign-ins when this machine is linked, or null.
export function localBing(): Promise<BingCall | null> {
  bing ??= readBingApiKey()
    .catch(() => undefined)
    .then((key) =>
      key
        ? bingCall({ apiKey: key.apiKey }, { signIn: LOCAL_BING_CONNECT })
        : cloudLinked()
          ? cloudBing()
          : null,
    )
  return bing
}

// The Google sign-ins on this machine: the seoskill.dev account's when it is
// linked, else the local sign-in.
export async function localAccounts(): Promise<GoogleAccount[]> {
  if (!cloudLinked()) return [{ email: null, google: await localGoogleFetch() }]
  return (await cloudGoogleEmails()).map((email) => ({
    email,
    google: bearerFetch(() => cloudGoogleToken(email)),
  }))
}

// Provider keys, as header-style names: keys saved on this machine win over
// the seoskill.dev account's. Keys go only to their provider.
export async function localResearchKeys(): Promise<Headers> {
  const [dataForSeo, ahrefs, clicky, saved] = await Promise.all([
    readDataForSeoCredentials().catch(() => undefined),
    readAhrefsApiKey().catch(() => undefined),
    readClickySiteKeys().catch(() => ({})),
    cloudLinked() ? cloudKeys().catch(() => ({})) : {},
  ])
  const keys = new Headers(saved)
  // A Clicky site saved on the account also knows its domain, so it stays.
  for (const [siteId, sitekey] of Object.entries(clicky)) {
    const name = `${CLICKY_KEY_PREFIX}${siteId}`
    if (!keys.has(name)) keys.set(name, sitekey)
  }
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
