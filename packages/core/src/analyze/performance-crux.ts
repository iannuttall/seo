import pRetry from 'p-retry'
import { fetch } from 'undici'
import { parseCruxFieldData } from './performance-analysis.js'
import type { PerformanceAuditReport } from './performance-types.js'

const CRUX_METRICS = [
  'cumulative_layout_shift',
  'interaction_to_next_paint',
  'largest_contentful_paint',
] as const

type CruxRecord = {
  key?: { url?: string; origin?: string; formFactor?: string }
  collectionPeriod?: {
    firstDate?: { year?: number; month?: number; day?: number }
    lastDate?: { year?: number; month?: number; day?: number }
  }
  metrics?: Record<string, unknown>
}

type CruxResult = {
  fieldData?: PerformanceAuditReport['fieldData']
  status: PerformanceAuditReport['fieldDataStatus']
  caveat: string
}

export async function fetchCruxFieldData(input: {
  url: string
  strategy?: 'desktop' | 'mobile'
  apiKey?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<CruxResult> {
  const checkedUrl = input.url
  const checkedOrigin = new URL(input.url).origin
  const formFactor = input.strategy === 'desktop' ? 'DESKTOP' : 'PHONE'

  if (!input.apiKey) {
    return {
      status: {
        provider: 'crux',
        status: 'not_configured',
        reason: 'Chrome UX Report field data is not configured.',
        checkedUrl,
        checkedOrigin,
        formFactor,
      },
      caveat: 'Field Core Web Vitals were not checked in this run.',
    }
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const endpoint = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(input.apiKey)}`

  async function query(body: { url?: string; origin?: string }) {
    return pRetry(
      async () => {
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(),
          input.timeoutMs ?? 10_000,
        )
        try {
          const response = await fetchImpl(endpoint, {
            method: 'POST',
            body: JSON.stringify({
              ...body,
              formFactor,
              metrics: CRUX_METRICS,
            }),
            headers: { 'content-type': 'application/json' },
            signal: controller.signal,
          })
          const json = (await response.json().catch(() => ({}))) as {
            record?: CruxRecord
          }
          if (response.status === 404) return { response, json }
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`CrUX transient HTTP ${response.status}`)
          }
          if (!response.ok) return { response, json }
          if (!json.record) {
            throw new Error('CrUX returned no record.')
          }
          return { response, json }
        } finally {
          clearTimeout(timer)
        }
      },
      { retries: 2, minTimeout: 250, factor: 2 },
    )
  }

  try {
    const attempts = [
      { scope: 'url' as const, body: { url: checkedUrl } },
      { scope: 'origin' as const, body: { origin: checkedOrigin } },
    ]
    let lastStatus: number | undefined

    for (const attempt of attempts) {
      const { response, json } = await query(attempt.body)
      lastStatus = response.status
      if (response.ok && json.record) {
        const fieldData = parseCruxFieldData({
          record: json.record,
          requestedFormFactor: formFactor,
        })
        return {
          fieldData,
          status: {
            provider: 'crux',
            status: 'available',
            reason: `Chrome UX Report ${attempt.scope}-level field data was available.`,
            checkedUrl,
            checkedOrigin,
            formFactor,
            httpStatus: response.status,
          },
          caveat: `CrUX ${attempt.scope}-level ${formFactor.toLowerCase()} field data covers a rolling collection period; it is not the Lighthouse run.`,
        }
      }
      if (!response.ok && response.status !== 404) {
        return {
          status: {
            provider: 'crux',
            status: 'request_failed',
            reason: 'Chrome UX Report field data could not be fetched.',
            checkedUrl,
            checkedOrigin,
            formFactor,
            httpStatus: response.status,
          },
          caveat: 'Chrome UX Report field data could not be fetched right now.',
        }
      }
    }

    return {
      status: {
        provider: 'crux',
        status: 'unavailable_no_coverage',
        reason:
          'Chrome UX Report does not have enough field data for this URL or origin.',
        checkedUrl,
        checkedOrigin,
        formFactor,
        httpStatus: lastStatus,
      },
      caveat:
        'Chrome UX Report does not have enough device-specific field data for this URL or origin.',
    }
  } catch {
    return {
      status: {
        provider: 'crux',
        status: 'request_failed',
        reason: 'Chrome UX Report field data could not be fetched.',
        checkedUrl,
        checkedOrigin,
        formFactor,
      },
      caveat: 'Chrome UX Report field data could not be fetched right now.',
    }
  }
}
