import type { RequestInit, Response } from 'undici'
import { SeoError } from '../errors.js'
import {
  publicHttpFetch,
  readBoundedResponseText,
} from '../fetch/http-client.js'
import { parseIndexNowSite, validateIndexNowKeyRecord } from './keys.js'
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS,
  type IndexNowKey,
  type IndexNowSubmission,
} from './types.js'

type IndexNowFetch = (url: string, init?: RequestInit) => Promise<Response>

function uniqueUrls(values: string[], host: string): string[] {
  if (values.length === 0) {
    throw new SeoError('INVALID_INPUT', 'Pass at least one URL to IndexNow.')
  }
  if (values.length > INDEXNOW_MAX_URLS) {
    throw new SeoError(
      'INVALID_INPUT',
      `IndexNow submissions are limited to ${INDEXNOW_MAX_URLS} URLs per run.`,
    )
  }
  const urls = new Set<string>()
  for (const value of values) {
    const url = parseIndexNowSite(value)
    if (url.toString().length > 2_000) {
      throw new SeoError(
        'INVALID_INPUT',
        'IndexNow URLs cannot exceed 2,000 characters.',
      )
    }
    if (url.hostname.toLowerCase() !== host) {
      throw new SeoError(
        'INVALID_INPUT',
        `Every IndexNow URL must belong to ${host}.`,
      )
    }
    url.hash = ''
    urls.add(url.toString())
  }
  return [...urls].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export async function verifyIndexNowKey(input: {
  record: IndexNowKey
  fetchImpl?: IndexNowFetch
  timeoutMs?: number
}): Promise<{
  verified: boolean
  status: number
  keyLocation: string
}> {
  const record = validateIndexNowKeyRecord(input.record)
  const keyLocation = parseIndexNowSite(record.keyLocation)
  let response: Response
  try {
    response = await (input.fetchImpl ?? publicHttpFetch)(
      keyLocation.toString(),
      {
        headers: { accept: 'text/plain' },
        redirect: 'manual',
        signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
      },
    )
  } catch (error) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `IndexNow key verification failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const body = await readBoundedResponseText(response, 512, 'IndexNow key file')
  return {
    verified: response.ok && body.trim() === record.key,
    status: response.status,
    keyLocation: keyLocation.toString(),
  }
}

function indexNowFailure(status: number): SeoError {
  if (status === 403) {
    return new SeoError(
      'ACCESS_DENIED',
      'IndexNow could not validate the key. Confirm the public key file contains the saved key.',
    )
  }
  if (status === 429) {
    return new SeoError(
      'RATE_LIMITED',
      'IndexNow rate limited this submission. Wait before trying again.',
    )
  }
  if (status === 400 || status === 422) {
    return new SeoError(
      'INVALID_INPUT',
      `IndexNow rejected the submission with HTTP ${status}. Check the URL host and key configuration.`,
    )
  }
  return new SeoError(
    'PROVIDER_UNAVAILABLE',
    `IndexNow submission failed with HTTP ${status}.`,
  )
}

export async function submitIndexNow(input: {
  record: IndexNowKey
  urls: string[]
  dryRun?: boolean
  fetchImpl?: IndexNowFetch
  now?: Date
}): Promise<IndexNowSubmission> {
  const record = validateIndexNowKeyRecord(input.record)
  const urls = uniqueUrls(input.urls, record.host)
  const keyLocation = parseIndexNowSite(record.keyLocation)
  const base = {
    schemaVersion: 1 as const,
    generatedAt: (input.now ?? new Date()).toISOString(),
    endpoint: INDEXNOW_ENDPOINT as typeof INDEXNOW_ENDPOINT,
    host: record.host,
    keyLocation: keyLocation.toString(),
    submittedUrls: urls.length,
    caveats: [
      'IndexNow confirms receipt, not crawling, indexing, ranking, or traffic.',
      'Submit URLs only after they are added, updated, or deleted.',
    ],
  }
  if (input.dryRun) {
    return { ...base, dryRun: true, status: 'validated' }
  }
  const verification = await verifyIndexNowKey({
    record,
    fetchImpl: input.fetchImpl,
  })
  if (!verification.verified) {
    throw new SeoError(
      'ACCESS_DENIED',
      `IndexNow key verification failed at ${verification.keyLocation} with HTTP ${verification.status}. Deploy the generated key file before submitting URLs.`,
    )
  }

  let response: Response
  try {
    response = await (input.fetchImpl ?? publicHttpFetch)(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        host: record.host,
        key: record.key,
        keyLocation: keyLocation.toString(),
        urlList: urls,
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `IndexNow did not respond: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  await readBoundedResponseText(response, 64_000, 'IndexNow response')
  if (response.status !== 200 && response.status !== 202) {
    throw indexNowFailure(response.status)
  }
  return {
    ...base,
    dryRun: false,
    status: response.status === 200 ? 'submitted' : 'pending-validation',
    responseStatus: response.status,
  }
}
