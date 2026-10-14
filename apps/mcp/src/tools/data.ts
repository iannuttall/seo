import {
  type AnalyticsInput,
  dateWindow,
  PAGE_SIZE,
  rowsText,
  table,
} from '@seo/core/commands'
import { z } from 'zod'
import { listAnalyticsProperties, listProperties } from '../google.ts'
import { landingPages } from '../providers/analytics.ts'
import { defineTool, type ToolContext, ToolError } from './registry.ts'

// The two hosted-only parts: listing what this sign-in can read, and landing
// pages from analytics accounts.

export const seoSites = defineTool({
  name: 'seo_sites',
  title: 'List sites',
  description:
    'Lists the Search Console properties and Google Analytics properties this Google sign-in can read, and which provider keys this connection sends. Call it first.',
  input: z.object({}),
  async run(context) {
    const [properties, analytics] = await Promise.all([
      listProperties(context.google),
      listAnalyticsProperties(context.google).catch((error) =>
        error instanceof ToolError ? null : Promise.reject(error),
      ),
    ])
    const keys = [
      ['dataforseo', 'x-dataforseo-login'],
      ['ahrefs', 'x-ahrefs-key'],
    ]
      .filter(([, name]) => context.headers.get(name ?? ''))
      .map(([provider]) => provider)
    return [
      `Search Console properties (${properties.length}):`,
      properties.length
        ? table(properties, ['siteUrl', 'permissionLevel'], null)
        : 'None. This Google account has no Search Console access, so the reports cannot run.',
      analytics === null
        ? 'Google Analytics: not granted on this sign-in.'
        : `Google Analytics properties (${analytics.length}):\n${table(analytics, ['property', 'name', 'account'], null)}`,
      `Provider keys on this connection: ${keys.length ? keys.join(', ') : 'none'}.`,
      'Next: seo_report with a site.',
    ].join('\n\n')
  },
})

export async function hostedAnalytics(
  context: ToolContext,
  input: AnalyticsInput,
): Promise<{ text: string; data: unknown }> {
  const range = dateWindow(input, 28)
  const result = await landingPages(context.google, {
    site: input.site,
    ...range,
    searchOnly: true,
    limit: Math.min(1000, input.offset + PAGE_SIZE),
  })
  return {
    text: rowsText({
      title: `${input.source} search landing pages for ${input.site}, ${range.startDate} to ${range.endDate}.`,
      rows: result.rows,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
      notes: result.notes,
    }),
    data: {
      range,
      rows: result.rows.slice(input.offset, input.offset + PAGE_SIZE),
    },
  }
}
