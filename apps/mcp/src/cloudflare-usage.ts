// The Cloudflare account's usage this calendar month and an estimate of
// what it costs at Workers Paid list prices, for the weekly cost report and
// its alert (cost-report.ts). Account-wide, so it covers every Worker,
// database and bucket on the account, not only SEO Skill's. An estimate,
// never the bill. Needs CLOUDFLARE_ANALYTICS_TOKEN (Account Analytics:
// Read); without it the report says so.

import { readJson } from '@seo/core/hosted'
import { z } from 'zod'

const ACCOUNT_ID = 'ab5ec097e2579c5f3639612c755e6f15' // wrangler.jsonc
export const CLOUDFLARE_ALERT_USD = 25

// Paid Standard list prices, checked 2026-09-30. Monthly allowances are
// account-wide.
// https://developers.cloudflare.com/workers/platform/pricing/
// https://developers.cloudflare.com/durable-objects/platform/pricing/
// https://developers.cloudflare.com/d1/platform/pricing/
// https://developers.cloudflare.com/r2/pricing/
const BASE_USD = 5
const PRICES = {
  workerRequests: { included: 10_000_000, unit: 1_000_000, usd: 0.3 },
  workerCpuMs: { included: 30_000_000, unit: 1_000_000, usd: 0.02 },
  objectRequests: { included: 1_000_000, unit: 1_000_000, usd: 0.15 },
  objectGbSeconds: { included: 400_000, unit: 1_000_000, usd: 12.5 },
  d1Read: { included: 25_000_000_000, unit: 1_000_000, usd: 0.001 },
  d1Write: { included: 50_000_000, unit: 1_000_000, usd: 1 },
  d1Gb: { included: 5, unit: 1, usd: 0.75 },
  r2A: { included: 1_000_000, unit: 1_000_000, usd: 4.5 },
  r2B: { included: 10_000_000, unit: 1_000_000, usd: 0.36 },
  r2Gb: { included: 10, unit: 1, usd: 0.015 },
} as const

const QUERY = `query Usage($account: string!, $start: Time!, $end: Time!, $date: Date!) {
 viewer { accounts(filter: {accountTag: $account}) {
  workers: workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests cpuTimeUs } }
  objects: durableObjectsInvocationsAdaptiveGroups(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests } }
  duration: durableObjectsPeriodicGroups(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { duration } }
  d1: d1AnalyticsAdaptiveGroups(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { rowsRead rowsWritten } }
  d1Storage: d1StorageAdaptiveGroups(limit: 1000, filter: {date: $date}) { dimensions { databaseId } max { databaseSizeBytes } }
  r2: r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $start, datetime_leq: $end}) { dimensions { actionType storageClass } sum { requests } }
  r2Storage: r2StorageAdaptiveGroups(limit: 1000, filter: {date: $date}) { dimensions { bucketName storageClass } max { payloadSize metadataSize } }
 } }
}`

const number = z.number().nonnegative()
const sums = <T extends z.ZodRawShape>(shape: T) =>
  z.array(z.object({ sum: z.object(shape) }))
const accountSchema = z.object({
  workers: sums({ requests: number, cpuTimeUs: number }),
  objects: sums({ requests: number }),
  duration: sums({ duration: number }),
  d1: sums({ rowsRead: number, rowsWritten: number }),
  d1Storage: z.array(
    z.object({ max: z.object({ databaseSizeBytes: number }) }),
  ),
  r2: z.array(
    z.object({
      dimensions: z.object({
        actionType: z.string(),
        storageClass: z.string(),
      }),
      sum: z.object({ requests: number }),
    }),
  ),
  r2Storage: z.array(
    z.object({
      dimensions: z.object({ storageClass: z.string() }),
      max: z.object({ payloadSize: number, metadataSize: number }),
    }),
  ),
})
const responseSchema = z.object({
  data: z
    .object({
      viewer: z.object({ accounts: z.array(accountSchema).length(1) }),
    })
    .nullish(),
  errors: z.array(z.object({ message: z.string() })).nullish(),
})

const CLASS_A = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
])
const CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
])
const FREE_R2 = new Set([
  'DeleteObject',
  'DeleteBucket',
  'AbortMultipartUpload',
])

export type CloudflareUsage =
  | { available: false; reason: string }
  | {
      available: true
      month: string
      usage: Record<keyof typeof PRICES, number>
      estimatedUsd: number
      snapshot: string
      unpricedR2: number
    }

export async function cloudflareUsage(
  env: Env,
  now: number,
): Promise<CloudflareUsage> {
  if (!env.CLOUDFLARE_ANALYTICS_TOKEN) {
    return { available: false, reason: 'no CLOUDFLARE_ANALYTICS_TOKEN set' }
  }
  try {
    const end = new Date(now)
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
    // Daily storage datasets lag; use yesterday's complete snapshot.
    const snapshot = new Date(now - 86_400_000).toISOString().slice(0, 10)
    const response = await fetch(
      'https://api.cloudflare.com/client/v4/graphql',
      {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: QUERY,
          variables: {
            account: ACCOUNT_ID,
            start: start.toISOString(),
            end: end.toISOString(),
            date: snapshot,
          },
        }),
      },
    )
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Cloudflare answered ${response.status}`)
    }
    const data = responseSchema.parse(
      await readJson(response, 'Cloudflare', { maxBytes: 1_000_000 }),
    )
    const account = data.data?.viewer.accounts[0]
    if (data.errors?.length || !account) throw new Error('no analytics')
    let r2A = 0
    let r2B = 0
    let unpricedR2 = 0
    for (const row of account.r2) {
      const action = row.dimensions.actionType
      if (row.dimensions.storageClass !== 'Standard') {
        unpricedR2 += row.sum.requests
      } else if (CLASS_A.has(action)) r2A += row.sum.requests
      else if (CLASS_B.has(action)) r2B += row.sum.requests
      else if (!FREE_R2.has(action)) unpricedR2 += row.sum.requests
    }
    const total = <T>(rows: T[], value: (row: T) => number) =>
      rows.reduce((sum, row) => sum + value(row), 0)
    const usage = {
      workerRequests: total(account.workers, (row) => row.sum.requests),
      workerCpuMs: total(account.workers, (row) => row.sum.cpuTimeUs / 1000),
      objectRequests: total(account.objects, (row) => row.sum.requests),
      objectGbSeconds: total(account.duration, (row) => row.sum.duration),
      d1Read: total(account.d1, (row) => row.sum.rowsRead),
      d1Write: total(account.d1, (row) => row.sum.rowsWritten),
      d1Gb: total(account.d1Storage, (row) => row.max.databaseSizeBytes / 1e9),
      r2A,
      r2B,
      r2Gb: total(
        account.r2Storage.filter(
          (row) => row.dimensions.storageClass === 'Standard',
        ),
        (row) => (row.max.payloadSize + row.max.metadataSize) / 1e9,
      ),
    }
    const charges = Object.entries(usage).map(([metric, value]) => {
      const price = PRICES[metric as keyof typeof PRICES]
      const units = Math.max(0, value - price.included) / price.unit
      // Durable Objects and R2 bill whole units.
      const billed =
        metric.startsWith('object') || metric.startsWith('r2')
          ? Math.ceil(units)
          : units
      return billed * price.usd
    })
    return {
      available: true,
      month: start.toISOString().slice(0, 7),
      usage,
      estimatedUsd: BASE_USD + charges.reduce((sum, usd) => sum + usd, 0),
      snapshot,
      unpricedR2,
    }
  } catch {
    return { available: false, reason: 'could not be read' }
  }
}

const whole = (value: number) => Math.round(value).toLocaleString('en-GB')

export function cloudflareLines(report: CloudflareUsage): string[] {
  if (!report.available) return [`Cloudflare usage: ${report.reason}.`]
  const u = report.usage
  return [
    `Cloudflare account, month to date (${report.month}), every app on it:`,
    `Workers: ${whole(u.workerRequests)} requests, ${whole(u.workerCpuMs)} CPU ms`,
    `Durable Objects: ${whole(u.objectRequests)} requests, ${u.objectGbSeconds.toFixed(2)} GB-s`,
    `D1: ${whole(u.d1Read)} rows read, ${whole(u.d1Write)} written, ${u.d1Gb.toFixed(3)} GB`,
    `R2: ${whole(u.r2A)} Class A, ${whole(u.r2B)} Class B, ${u.r2Gb.toFixed(3)} GB`,
    `Estimated cost at list prices: $${report.estimatedUsd.toFixed(2)}, with the $5 base. Leaves out Workers AI, Browser Run, Durable Object storage, KV, logs, other products and tax. Storage uses the ${report.snapshot} snapshot for the whole month.`,
    ...(report.unpricedR2
      ? [`R2 operations not priced: ${whole(report.unpricedR2)}.`]
      : []),
  ]
}
