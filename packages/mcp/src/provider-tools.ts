import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  bingWebmasterOverview,
  collectBingLinkEvidence,
  collectDataForSeoLinkEvidence,
  importLinkEvidence,
  linkEvidenceReport,
  linkTargetContext,
  SeoError,
} from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

const MAX_AGENT_ROWS_PER_SECTION = 14

type BingOverview = Awaited<ReturnType<typeof bingWebmasterOverview>>

function compactRows<
  T extends {
    rows: unknown[]
    outputSelection?: {
      strategy: 'most-recent'
      availableRows: number
      returnedRows: number
      omittedRows: number
    }
  },
>(data: T) {
  if (data.rows.length <= MAX_AGENT_ROWS_PER_SECTION && data.outputSelection) {
    return data
  }
  const rows = data.rows.slice(-MAX_AGENT_ROWS_PER_SECTION)
  return {
    ...data,
    rows,
    outputSelection: {
      strategy: 'most-recent' as const,
      availableRows: data.rows.length,
      returnedRows: rows.length,
      omittedRows: Math.max(0, data.rows.length - rows.length),
    },
  }
}

export function compactBingWebmasterOverview(result: BingOverview) {
  return {
    ...result,
    traffic:
      result.traffic.status === 'unavailable'
        ? result.traffic
        : {
            ...result.traffic,
            data: compactRows(result.traffic.data),
          },
    crawl:
      result.crawl.status === 'unavailable'
        ? result.crawl
        : {
            ...result.crawl,
            data: compactRows(result.crawl.data),
          },
    outputBudget: result.outputBudget,
  }
}

export function registerProviderTools(server: McpServer): void {
  server.registerTool(
    'seo_bing_webmaster_overview',
    {
      description:
        'Find bounded Bing traffic, crawl, query, and page insights for one verified site',
      inputSchema: {
        site: z.string().url().max(2_000),
      },
    },
    async ({ site }) => {
      try {
        const result = await bingWebmasterOverview({ site })
        const firstFinding = result.findings[0]?.title
        return toolSuccess(
          `Bing evidence is ${result.dataStatus} with ${result.summary.findings} findings.${firstFinding ? ` Review first: ${firstFinding}.` : ''}`,
          compactBingWebmasterOverview(result),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
  server.registerTool(
    'seo_link_evidence',
    {
      description:
        'Review bounded referring-link evidence from DataForSEO, Bing Webmaster or a local export',
      inputSchema: {
        site: z.string().url().max(2_000).optional(),
        provider: z.enum(['dataforseo', 'bing']).optional(),
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
            'Pass one link source: file, site for Bing, or target for DataForSEO.',
          )
        }
        if (file && provider) {
          throw new SeoError(
            'INVALID_INPUT',
            'Do not pass provider with a local link file.',
          )
        }
        if (liveProvider === 'dataforseo' && !target) {
          throw new SeoError(
            'INVALID_INPUT',
            'Pass target for DataForSEO link evidence.',
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
          searchConsoleSite || evidence.provenance.provider === 'dataforseo'
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
