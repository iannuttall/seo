import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'seo-second-page',
    {
      description: 'Run second-page opportunity analysis',
      argsSchema: {
        site: z.string(),
        range: z.string().optional(),
        limit: z.string().optional(),
      },
    },
    async ({ site, range, limit }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run the seo_second_page tool with site=${site}, range=${range ?? '28'}, limit=${limit ?? '5'}. Use only tool output. Quote the evidenceRef. Do not invent data.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'seo-audit-page',
    {
      description: 'Run a page audit and explain issues without inventing data',
      argsSchema: {
        url: z.string(),
      },
    },
    async ({ url }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run seo_audit_page for ${url}. Explain findings using the returned principle and evidenceRef values only.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'seo-crawl-site-audit',
    {
      description:
        'Run a technical SEO/GEO crawl and return a concise human audit with structured follow-up data',
      argsSchema: {
        url: z.string(),
        site: z.string().optional(),
        maxPages: z.string().optional(),
      },
    },
    async ({ url, site, maxPages }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Use the seo://crawler/workflows resource first, then audit ${url}.`,
              `Call seo_crawl_site with url=${url}, saveReport=true, includePages=false, includeIssues=false, maxPages=${maxPages ?? '50'}${site ? `, site=${site}` : ''}.`,
              'Read summary, topFixes, warnings, and caveats before using follow-up tools.',
              'For the top 3 to 5 fixes, call seo_explain_issue and seo_affected_urls.',
              'Return a plain-English report for humans plus structured rule ids, affected counts, sample URLs, and verification commands for agents. Do not invent data.',
            ].join(' '),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'seo-crawl-implementation-queue',
    {
      description:
        'Turn a crawl into a ranked implementation queue with fix guidance and verification commands',
      argsSchema: {
        url: z.string(),
        site: z.string().optional(),
        maxPages: z.string().optional(),
        limit: z.string().optional(),
      },
    },
    async ({ url, site, maxPages, limit }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Use the seo://crawler/workflows resource and build an implementation queue for ${url}.`,
              `Call seo_crawl_site with url=${url}, saveReport=true, maxPages=${maxPages ?? '50'}${site ? `, site=${site}` : ''}.`,
              `Call seo_top_fixes with the saved reportId and limit=${limit ?? '10'}.`,
              'For each top item, call seo_affected_urls with the ruleId and seo_explain_issue for guidance.',
              'Return queue items with rank, ruleId, severity, score, affected count, sampleUrls, action, and verification.command. Keep action plain English and all ids/counts exact.',
            ].join(' '),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'seo-crawl-geo-readiness',
    {
      description:
        'Audit a site for GEO and AI-search readiness gaps using crawler MCP tools',
      argsSchema: {
        url: z.string(),
        site: z.string().optional(),
        maxPages: z.string().optional(),
        limit: z.string().optional(),
      },
    },
    async ({ url, site, maxPages, limit }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Use seo://crawler/workflows and audit GEO readiness for ${url}.`,
              `Call seo_crawl_site with url=${url}, saveReport=true, maxPages=${maxPages ?? '50'}${site ? `, site=${site}` : ''}.`,
              `Call seo_geo_gaps with the saved reportId and limit=${limit ?? '10'}.`,
              'Explain the main GEO rule ids with seo_explain_issue.',
              'Separate content fixes from technical fixes, and include exact pages, missing signals, plain-English actions, and verification commands. Do not invent data.',
            ].join(' '),
          },
        },
      ],
    }),
  )
}
