import {
  type Ga4RunReportResult,
  ga4ReportQualityWarnings,
  ga4RowsToObjects,
  runGa4Report,
} from '../../ga4/client.js'
import { templateForUrl } from '../pseo/templates.js'
import type {
  LocalAnalyticsEvidence,
  LocalAnalyticsLocation,
  LocalAnalyticsTemplate,
  LocalSearchTemplate,
} from './types.js'

const LOCATION_LIMIT = 25
const TEMPLATE_LOCATION_LIMIT = 3

type AnalyticsDependencies = {
  runReport?: typeof runGa4Report
}

type ValidRow = {
  path: string
  originalPath: string
  country: string | null
  region: string | null
  city: string | null
  sessions: number
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizePath(value: string): string {
  if (!value || value === '(not set)') return ''
  const [path = ''] = value.split('?')
  if (!path.startsWith('/')) return ''
  return path.replace(/\/+$/u, '') || '/'
}

function pathForUrl(value: string): string {
  try {
    return normalizePath(new URL(value).pathname)
  } catch {
    return ''
  }
}

function locationValue(value: string | undefined): string | null {
  const normalized = value?.normalize('NFKC').trim()
  return !normalized || normalized === '(not set)' ? null : normalized
}

function metric(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function parsedRow(
  row: Record<string, string>,
):
  | { kind: 'valid'; value: ValidRow }
  | { kind: 'missing' }
  | { kind: 'invalid' } {
  const originalPath = row.landingPagePlusQueryString ?? ''
  const sessionValue = row.sessions
  if (
    !originalPath.trim() ||
    originalPath === '(not set)' ||
    sessionValue === undefined ||
    !sessionValue.trim() ||
    sessionValue === '(not set)'
  ) {
    return { kind: 'missing' }
  }
  const path = normalizePath(originalPath)
  const sessions = metric(sessionValue)
  if (!path || sessions === null) return { kind: 'invalid' }
  return {
    kind: 'valid',
    value: {
      path,
      originalPath,
      country: locationValue(row.country),
      region: locationValue(row.region),
      city: locationValue(row.city),
      sessions,
    },
  }
}

function rowSignature(row: ValidRow): string {
  return [
    row.originalPath,
    row.country ?? '',
    row.region ?? '',
    row.city ?? '',
    row.sessions,
  ].join('\u0000')
}

type LocationAccumulator = {
  country: string | null
  region: string | null
  city: string | null
  sessions: number
  paths: Set<string>
}

function locationKey(row: {
  country: string | null
  region: string | null
  city: string | null
}): string {
  return [row.country ?? '', row.region ?? '', row.city ?? ''].join('\u0000')
}

function addLocation(
  locations: Map<string, LocationAccumulator>,
  row: ValidRow,
): void {
  const key = locationKey(row)
  const existing = locations.get(key) ?? {
    country: row.country,
    region: row.region,
    city: row.city,
    sessions: 0,
    paths: new Set<string>(),
  }
  existing.sessions += row.sessions
  existing.paths.add(row.path)
  locations.set(key, existing)
}

function locationsFrom(
  values: Iterable<LocationAccumulator>,
): LocalAnalyticsLocation[] {
  const locations = [...values]
  const retainedSessions = locations.reduce(
    (sum, location) => sum + location.sessions,
    0,
  )
  return locations
    .map((location) => ({
      country: location.country,
      region: location.region,
      city: location.city,
      sessions: location.sessions,
      landingPages: location.paths.size,
      retainedSessionShare:
        retainedSessions > 0 ? location.sessions / retainedSessions : 0,
    }))
    .sort(
      (left, right) =>
        right.sessions - left.sessions ||
        compareText(left.country ?? '', right.country ?? '') ||
        compareText(left.region ?? '', right.region ?? '') ||
        compareText(left.city ?? '', right.city ?? ''),
    )
}

function emptyEvidence(input: {
  requested: boolean
  propertyId?: string
  limit: number
  reason: string
}): LocalAnalyticsEvidence {
  return {
    requested: input.requested,
    status: input.requested ? 'unavailable' : 'not-requested',
    source: {
      provider: 'google-analytics',
      propertyId: input.propertyId ?? null,
      dimensions: ['landingPagePlusQueryString', 'country', 'region', 'city'],
      metrics: ['sessions'],
      returnedRows: 0,
      availableRows: null,
      retainedRows: 0,
      matchedRows: 0,
      matchedPages: 0,
      unmatchedRows: 0,
      missingRows: 0,
      invalidRows: 0,
      exactDuplicateRows: 0,
      limit: input.limit,
      limitReached: false,
      completeness: input.requested ? 'unavailable' : 'not-requested',
      qualityWarnings: [],
    },
    locations: [],
    locationCoverage: { available: 0, returned: 0, omitted: 0 },
    templates: [],
    reason: input.reason,
  }
}

function unavailableEvidence(input: {
  propertyId: string
  limit: number
  reason: string
}): LocalAnalyticsEvidence {
  return emptyEvidence({ ...input, requested: true })
}

function sourceRows(result: Ga4RunReportResult): Array<Record<string, string>> {
  return ga4RowsToObjects(result)
}

export async function localAnalyticsEvidence(
  input: {
    propertyId?: string
    startDate: string
    endDate: string
    limit: number
    localPageUrls: string[]
    templates: LocalSearchTemplate[]
    refresh?: boolean
  },
  dependencies: AnalyticsDependencies = {},
): Promise<LocalAnalyticsEvidence> {
  if (!input.propertyId) {
    return emptyEvidence({
      requested: false,
      limit: input.limit,
      reason:
        'Google Analytics geography was not requested because no property id was supplied.',
    })
  }
  if (input.localPageUrls.length === 0) {
    const empty = emptyEvidence({
      requested: true,
      propertyId: input.propertyId,
      limit: input.limit,
      reason:
        'No retained local landing page was available for a Google Analytics geography join.',
    })
    return {
      ...empty,
      status: 'skipped',
      source: {
        ...empty.source,
        completeness: 'complete',
      },
    }
  }

  let result: Ga4RunReportResult
  try {
    result = await (dependencies.runReport ?? runGa4Report)(
      input.propertyId,
      {
        dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
        dimensions: [
          { name: 'landingPagePlusQueryString' },
          { name: 'country' },
          { name: 'region' },
          { name: 'city' },
        ],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: input.limit,
      },
      { refresh: input.refresh },
    )
  } catch (error) {
    return unavailableEvidence({
      propertyId: input.propertyId,
      limit: input.limit,
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  const rows = sourceRows(result)
  const localPaths = new Map(
    input.localPageUrls
      .map((url) => [pathForUrl(url), url] as const)
      .filter(([path]) => Boolean(path)),
  )
  const templateSignatures = new Set(
    input.templates.map((template) => template.signature),
  )
  const templateLocations = new Map<string, Map<string, LocationAccumulator>>()
  const templatePaths = new Map<string, Set<string>>()
  const locations = new Map<string, LocationAccumulator>()
  const matchedPaths = new Set<string>()
  const signatures = new Set<string>()
  let missingRows = 0
  let invalidRows = 0
  let exactDuplicateRows = 0
  let unmatchedRows = 0
  let matchedRows = 0

  for (const source of rows) {
    const parsed = parsedRow(source)
    if (parsed.kind === 'missing') {
      missingRows++
      continue
    }
    if (parsed.kind === 'invalid') {
      invalidRows++
      continue
    }
    const row = parsed.value
    const signature = rowSignature(row)
    if (signatures.has(signature)) {
      exactDuplicateRows++
      continue
    }
    signatures.add(signature)
    const pageUrl = localPaths.get(row.path)
    if (!pageUrl) {
      unmatchedRows++
      continue
    }
    matchedRows++
    matchedPaths.add(row.path)
    addLocation(locations, row)
    const templateSignature = templateForUrl(pageUrl, input.templates)
    if (!templateSignatures.has(templateSignature)) continue
    const byLocation =
      templateLocations.get(templateSignature) ??
      new Map<string, LocationAccumulator>()
    addLocation(byLocation, row)
    templateLocations.set(templateSignature, byLocation)
    const paths = templatePaths.get(templateSignature) ?? new Set<string>()
    paths.add(row.path)
    templatePaths.set(templateSignature, paths)
  }

  const allLocations = locationsFrom(locations.values())
  const templates: LocalAnalyticsTemplate[] = [...templateLocations.entries()]
    .map(([signature, byLocation]) => {
      const all = locationsFrom(byLocation.values())
      return {
        signature,
        sessions: all.reduce((sum, location) => sum + location.sessions, 0),
        landingPages: templatePaths.get(signature)?.size ?? 0,
        locations: all.slice(0, TEMPLATE_LOCATION_LIMIT),
        locationCoverage: {
          available: all.length,
          returned: Math.min(TEMPLATE_LOCATION_LIMIT, all.length),
          omitted: Math.max(0, all.length - TEMPLATE_LOCATION_LIMIT),
        },
      }
    })
    .sort(
      (left, right) =>
        right.sessions - left.sessions ||
        compareText(left.signature, right.signature),
    )
  const qualityWarnings = ga4ReportQualityWarnings(
    result,
    'Google Analytics local landing-page geography report',
  )
  const availableRows = result.rowCount ?? null
  const limitReached =
    (availableRows !== null && availableRows > rows.length) ||
    rows.length >= input.limit
  const partial =
    limitReached ||
    qualityWarnings.length > 0 ||
    missingRows > 0 ||
    invalidRows > 0 ||
    exactDuplicateRows > 0
  const status: LocalAnalyticsEvidence['status'] =
    rows.length === 0
      ? 'empty'
      : matchedRows === 0
        ? 'filtered'
        : partial
          ? 'partial'
          : 'complete'

  return {
    requested: true,
    status,
    source: {
      provider: 'google-analytics',
      propertyId: input.propertyId,
      dimensions: ['landingPagePlusQueryString', 'country', 'region', 'city'],
      metrics: ['sessions'],
      returnedRows: rows.length,
      availableRows,
      retainedRows:
        rows.length - missingRows - invalidRows - exactDuplicateRows,
      matchedRows,
      matchedPages: matchedPaths.size,
      unmatchedRows,
      missingRows,
      invalidRows,
      exactDuplicateRows,
      limit: input.limit,
      limitReached,
      completeness: partial ? 'partial' : 'complete',
      qualityWarnings,
    },
    locations: allLocations.slice(0, LOCATION_LIMIT),
    locationCoverage: {
      available: allLocations.length,
      returned: Math.min(LOCATION_LIMIT, allLocations.length),
      omitted: Math.max(0, allLocations.length - LOCATION_LIMIT),
    },
    templates,
    ...(matchedRows === 0
      ? {
          reason:
            'The retained Google Analytics rows did not match a retained local landing page.',
        }
      : {}),
  }
}
