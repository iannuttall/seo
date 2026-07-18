import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  bingWebmasterOverview,
  collectBingLinkEvidence,
  importLinkEvidence,
  linkEvidenceReport,
  SeoError,
} from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

const MAX_AGENT_ROWS_PER_SECTION = 14

type BingOverview = Awaited<ReturnType<typeof bingWebmasterOverview>>

function compactRows<T extends { rows: unknown[] }>(data: T) {
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
    outputBudget: {
      maxRowsPerSection: MAX_AGENT_ROWS_PER_SECTION,
      strategy: 'most-recent' as const,
    },
  }
}

export function registerProviderTools(server: McpServer): void {
  server.registerTool(
    'seo_bing_webmaster_overview',
    {
      description:
        'Report bounded Bing Webmaster search and crawl evidence for one verified site',
      inputSchema: {
        site: z.string().url().max(2_000),
      },
    },
    async ({ site }) => {
      try {
        const result = await bingWebmasterOverview({ site })
        const clicks =
          result.traffic.status === 'unavailable'
            ? 'unavailable'
            : String(result.traffic.data.clicks)
        return toolSuccess(
          `Bing evidence is ${result.dataStatus}. Observed clicks: ${clicks}.`,
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
        'Review bounded referring-link evidence from Bing Webmaster or a local export',
      inputSchema: {
        site: z.string().url().max(2_000).optional(),
        file: z.string().min(1).max(4_096).optional(),
        format: z.enum(['csv', 'json', 'jsonl']).optional(),
        rowLimit: z.number().int().min(1).max(100_000).optional(),
        targetLimit: z.number().int().min(1).max(50).optional(),
        detailPagesPerTarget: z.number().int().min(1).max(3).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({
      site,
      file,
      format,
      rowLimit,
      targetLimit,
      detailPagesPerTarget,
      limit,
    }) => {
      try {
        if (Boolean(site) === Boolean(file)) {
          throw new SeoError(
            'INVALID_INPUT',
            'Pass exactly one of site for Bing or file for a local import.',
          )
        }
        const evidence = file
          ? await importLinkEvidence({ file, format, rowLimit })
          : await collectBingLinkEvidence({
              site: site ?? '',
              rowLimit,
              targetLimit,
              detailPagesPerTarget,
            })
        const report = linkEvidenceReport({ evidence, limit })
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
