import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  collectAhrefsLinkEvidence,
  collectBingLinkEvidence,
  collectDataForSeoLinkEvidence,
  importLinkEvidence,
  linkEvidenceReport,
  linkTargetContext,
  SeoError,
} from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

export function registerProviderTools(server: McpServer): void {
  server.registerTool(
    'seo_link_evidence',
    {
      description:
        'Review bounded referring-link evidence from Ahrefs, DataForSEO, Bing Webmaster or a local export',
      inputSchema: {
        site: z.string().url().max(2_000).optional(),
        provider: z.enum(['ahrefs', 'dataforseo', 'bing']).optional(),
        target: z.string().trim().min(1).max(2_048).optional(),
        scope: z.enum(['domain', 'page']).optional(),
        includeSubdomains: z.boolean().optional(),
        searchConsoleSite: z.string().trim().min(1).max(2_048).optional(),
        file: z.string().min(1).max(4_096).optional(),
        format: z.enum(['csv', 'json', 'jsonl']).optional(),
        rowLimit: z.number().int().min(1).max(100_000).optional(),
        targetLimit: z.number().int().min(1).max(50).optional(),
        detailPagesPerTarget: z.number().int().min(1).max(3).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        days: z.number().int().min(1).max(548).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      site,
      provider,
      target,
      scope,
      includeSubdomains,
      searchConsoleSite,
      file,
      format,
      rowLimit,
      targetLimit,
      detailPagesPerTarget,
      limit,
      days,
      refresh,
    }) => {
      try {
        const liveProvider = provider ?? (target ? 'dataforseo' : 'bing')
        const sourceCount =
          Number(Boolean(file)) +
          Number(Boolean(site)) +
          Number(Boolean(target))
        if (sourceCount !== 1) {
          throw new SeoError(
            'INVALID_INPUT',
            'Pass one link source: file, site for Bing, or target for Ahrefs or DataForSEO.',
          )
        }
        if (file && provider) {
          throw new SeoError(
            'INVALID_INPUT',
            'Do not pass provider with a local link file.',
          )
        }
        if (['ahrefs', 'dataforseo'].includes(liveProvider) && !target) {
          throw new SeoError(
            'INVALID_INPUT',
            'Pass target for Ahrefs or DataForSEO link evidence.',
          )
        }
        if (liveProvider === 'bing' && !site && !file) {
          throw new SeoError(
            'INVALID_INPUT',
            'Pass site for Bing link evidence.',
          )
        }
        const evidence = file
          ? await importLinkEvidence({ file, format, rowLimit })
          : liveProvider === 'ahrefs'
            ? await collectAhrefsLinkEvidence({
                target: target ?? '',
                scope,
                includeSubdomains,
                rowLimit,
                refresh,
              })
            : liveProvider === 'dataforseo'
              ? await collectDataForSeoLinkEvidence({
                  target: target ?? '',
                  scope,
                  includeSubdomains,
                  rowLimit,
                  refresh,
                })
              : await collectBingLinkEvidence({
                  site: site ?? '',
                  rowLimit,
                  targetLimit,
                  detailPagesPerTarget,
                })
        const context =
          searchConsoleSite || evidence.externalProvider
            ? await linkTargetContext({
                evidence,
                searchConsoleSite,
                crawlSite: searchConsoleSite ?? target,
                days,
                refresh,
              })
            : undefined
        const report = linkEvidenceReport({
          evidence,
          limit,
          targetContext: context,
        })
        return toolSuccess(
          `${report.summary.observedLinks} referring links were retained from ${report.provenance.provider}.`,
          report,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
