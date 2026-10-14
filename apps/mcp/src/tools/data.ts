import { table } from '@seo/core/commands'
import { z } from 'zod'
import { listAnalyticsProperties, listProperties } from '../google.ts'
import { defineTool, ToolError } from './registry.ts'

// The hosted-only listing of what this sign-in can read.

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
