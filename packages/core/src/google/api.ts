import { SeoError, type SeoErrorCode } from '../errors.js'
import type { Ga4AccountSummary } from '../ga4/account-summaries.js'
import { collectGa4AccountSummaries } from '../ga4/account-summaries.js'
import type {
  SearchAnalyticsRequest,
  SearchAnalyticsResult,
} from '../gsc/client/types.js'
import { readJson } from '../http/read-json.js'
import type { GscRow } from '../types.js'

// Google API calls shared by every surface: Search Console rows, sites, URL
// Inspection and Google Analytics. Each surface passes a fetch that adds its
// own access token: the CLI's local sign-in or the hosted MCP's sealed token.
// Works in Node and in Workers; caching and quotas stay in the Node binding.

export type GoogleFetch = (url: string, init?: RequestInit) => Promise<Response>

export type GoogleCallOptions = {
  // What to do when Google rejects the sign-in, such as "Run `seo auth
  // login` again." or "Reconnect the MCP server."
  signIn: string
}

export class GoogleApiError extends SeoError {
  constructor(
    code: SeoErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(code, message)
  }
}

// A fetch that adds a bearer token and a JSON content type.
export function bearerFetch(
  token: () => Promise<string> | string,
): GoogleFetch {
  return async (url, init) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
      },
    })
}

async function failure(
  response: Response,
  label: string,
  subject: string | undefined,
  options: GoogleCallOptions,
): Promise<GoogleApiError> {
  const detail = (await response.text().catch(() => '')).slice(0, 300)
  const status = response.status
  const what = subject ? `${label} for ${subject}` : label
  if (status === 401) {
    return new GoogleApiError(
      'AUTH_EXPIRED',
      `Google rejected the sign-in. ${options.signIn}`,
      status,
    )
  }
  if (status === 403) {
    return new GoogleApiError(
      'ACCESS_DENIED',
      `Google denied access to ${what}. Check the Google account, its access to this property, and the granted scopes. ${detail}`.trim(),
      status,
    )
  }
  if (status === 404) {
    return new GoogleApiError(
      'PROPERTY_NOT_FOUND',
      `Google could not find ${what}. Check the property and account access.`,
      status,
    )
  }
  if (status === 429) {
    return new GoogleApiError(
      'RATE_LIMITED',
      `Google quota reached for ${label}. Wait and try again. ${detail}`.trim(),
      status,
    )
  }
  return new GoogleApiError(
    'PROVIDER_UNAVAILABLE',
    `${label} answered ${status}. ${detail}`.trim(),
    status,
  )
}

export async function googleJson<T>(
  gfetch: GoogleFetch,
  url: string,
  input: {
    body?: unknown
    label: string
    subject?: string
    maxBytes?: number
  } & GoogleCallOptions,
): Promise<T> {
  const response = await gfetch(url, {
    method: input.body === undefined ? 'GET' : 'POST',
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  })
  if (!response.ok) {
    throw await failure(response, input.label, input.subject, input)
  }
  return readJson<T>(response, input.label, { maxBytes: input.maxBytes })
}

const GSC = 'https://www.googleapis.com/webmasters/v3'
const PAGE_ROWS = 25_000

// Search Console rows, following pagination up to maxRows.
export async function searchAnalyticsRows(
  gfetch: GoogleFetch,
  site: string,
  body: SearchAnalyticsRequest,
  options: GoogleCallOptions,
): Promise<SearchAnalyticsResult> {
  const rows: GscRow[] = []
  const { maxRows: requested, ...apiBody } = body
  const maxRows = requested ?? body.rowLimit
  const url = `${GSC}/sites/${encodeURIComponent(site)}/searchAnalytics/query`
  let startRow = 0
  let calls = 0
  while (true) {
    const remaining =
      typeof maxRows === 'number' ? maxRows - rows.length : undefined
    if (typeof remaining === 'number' && remaining <= 0) break
    const rowLimit = Math.min(
      apiBody.rowLimit ?? PAGE_ROWS,
      remaining ?? PAGE_ROWS,
      PAGE_ROWS,
    )
    const json = await googleJson<{ rows?: GscRow[] }>(gfetch, url, {
      ...options,
      label: 'Search Console',
      subject: site,
      body: {
        ...apiBody,
        rowLimit,
        startRow,
        dataState: apiBody.dataState ?? 'final',
        dimensions: apiBody.dimensions ?? ['query', 'page'],
        type: apiBody.type ?? 'web',
        aggregationType: apiBody.aggregationType ?? 'auto',
      },
    })
    calls += 1
    const page = json.rows ?? []
    rows.push(...page)
    if (
      page.length < rowLimit ||
      (typeof maxRows === 'number' && rows.length >= maxRows)
    ) {
      break
    }
    startRow += rowLimit
  }
  return { rows, calls, rowsFetched: rows.length }
}

export type SearchConsoleSite = {
  siteUrl: string
  permissionLevel?: string
  siteType?: string
}

export async function listSearchConsoleSites(
  gfetch: GoogleFetch,
  options: GoogleCallOptions,
): Promise<SearchConsoleSite[]> {
  const json = await googleJson<{ siteEntry?: SearchConsoleSite[] }>(
    gfetch,
    `${GSC}/sites`,
    { ...options, label: 'Search Console' },
  )
  return json.siteEntry ?? []
}

export async function inspectSearchConsoleUrl(
  gfetch: GoogleFetch,
  site: string,
  url: string,
  options: GoogleCallOptions & { languageCode?: string },
): Promise<unknown> {
  return googleJson(
    gfetch,
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      ...options,
      label: 'URL Inspection',
      subject: url,
      body: {
        siteUrl: site,
        inspectionUrl: url,
        ...(options.languageCode ? { languageCode: options.languageCode } : {}),
      },
    },
  )
}

export async function listAnalyticsAccounts(
  gfetch: GoogleFetch,
  options: GoogleCallOptions,
): Promise<Ga4AccountSummary[]> {
  return collectGa4AccountSummaries(async (pageToken) => {
    const url = new URL(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
    )
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    return googleJson(gfetch, url.toString(), {
      ...options,
      label: 'Google Analytics accounts',
      maxBytes: 10 * 1024 * 1024,
    })
  })
}

export async function runAnalyticsReport<T = unknown>(
  gfetch: GoogleFetch,
  propertyId: string,
  body: unknown,
  options: GoogleCallOptions,
): Promise<T> {
  if (!/^\d+$/.test(propertyId)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The Google Analytics property must be its numeric id.',
    )
  }
  return googleJson<T>(
    gfetch,
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      ...options,
      label: 'Google Analytics',
      subject: `property ${propertyId}`,
      body,
    },
  )
}
