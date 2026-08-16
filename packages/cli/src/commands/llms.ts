import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { auditLlmsTxtLive, crawlSite, generateLlmsTxt } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue } from '../utils.js'
import { printNotes, printReportSummary } from './output.js'
import { resolveSavedCrawlReport } from './readiness.js'

async function writeOrPrint(path: string | undefined, content: string) {
  if (!path) {
    process.stdout.write(content)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  process.stdout.write(`Wrote ${path}\n`)
}

const sharedArgs = {
  url: {
    type: 'string',
    description: 'Public site or subpath URL to crawl.',
  },
  'report-id': {
    type: 'string',
    description: 'Saved crawl report id to use.',
  },
  site: {
    type: 'string',
    description: 'GSC property URL for selecting the latest saved crawl.',
  },
  client: {
    type: 'string',
    description: 'Legacy alias for --project.',
  },
  project: {
    type: 'string',
    description: 'Saved project id or name.',
  },
  'max-pages': {
    type: 'string',
    description: 'Maximum public HTML pages to crawl.',
  },
  'fetch-interval-cap': {
    type: 'string',
    description: 'Maximum page fetches per interval per host.',
  },
  'fetch-interval-ms': {
    type: 'string',
    description: 'Fetch rate interval in milliseconds.',
  },
  refresh: {
    type: 'boolean',
    default: false,
    description: 'Bypass local HTTP cache and fetch fresh pages.',
  },
  json: {
    type: 'boolean',
    default: false,
    description: 'Print machine-readable JSON.',
  },
} as const

async function resolveLlmsCrawl(
  args: Record<string, unknown>,
  options: { json: boolean },
) {
  const url = stringArg(args.url)
  const reportId = stringArg(args['report-id'])
  if (url && reportId) {
    throw new Error('Use either --url or --report-id, not both.')
  }
  if (!url) return resolveSavedCrawlReport(args, { json: options.json })

  const project = projectArg(args)
  const site = stringArg(args.site)
  const selection =
    project || site
      ? await resolveClientSelection({
          client: project,
          site,
          options: { json: options.json },
        })
      : undefined
  return crawlSite({
    url,
    projectId: selection?.client?.id,
    site: selection?.site,
    maxPages: numberArg(args['max-pages']),
    fetchRate: fetchRateArg(args),
    refresh: booleanArg(args.refresh),
    useSitemap: true,
    checkExternal: false,
  })
}

export const llmsAuditCommand = defineCommand({
  meta: {
    name: 'audit',
    description: 'Check an optional llms.txt file body and links',
  },
  args: sharedArgs,
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await resolveLlmsCrawl(args, { json })
    const audit = await auditLlmsTxtLive(report)
    if (json) {
      printJson(audit)
      return
    }

    printReportSummary({
      title: 'llms.txt audit',
      target: audit.url,
      status: audit.issues.length > 0 ? 'warning' : 'pass',
      summary: audit.headline,
      metrics: [
        { label: 'SEO impact', value: audit.googleSearchImpact },
        { label: 'Optional', value: audit.optional ? 'Yes' : 'No' },
        { label: 'Found', value: audit.exists ? 'Yes' : 'No' },
        { label: 'URL', value: audit.llmsTxtUrl },
        {
          label: 'HTTP status',
          value: audit.status ? String(audit.status) : 'Unavailable',
        },
      ],
      diagnostics: [
        {
          title: 'Issues',
          items: audit.issues.map((issue) => ({
            status: issue.severity === 'high' ? 'fail' : 'warning',
            title: issue.title,
            explanation: issue.plainEnglish,
            fix: issue.action,
          })),
        },
      ],
    })
    printNotes(
      'Recommended pages',
      audit.recommendedPages
        .slice(0, 10)
        .map((page) => `${page.section}: ${page.url}`),
    )
  },
})

export const llmsGenerateCommand = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate a valid llms.txt v2 draft from crawl data',
  },
  args: {
    ...sharedArgs,
    output: {
      type: 'string',
      description: 'Write llms.txt to this path instead of stdout.',
    },
    'max-urls': {
      type: 'string',
      description: 'Maximum URLs to include. Defaults to 100.',
    },
    'token-budget': {
      type: 'string',
      description: 'Approximate token budget. Defaults to 12000.',
    },
    exclude: {
      type: 'string',
      description: 'Comma-separated URL patterns to exclude.',
    },
    title: {
      type: 'string',
      description: 'Override the llms.txt title.',
    },
    description: {
      type: 'string',
      description: 'Override the llms.txt description.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await resolveLlmsCrawl(args, { json })
    const generated = generateLlmsTxt(report, {
      maxUrls: numberArg(args['max-urls']),
      tokenBudget: numberArg(args['token-budget']),
      exclude: csvArg(args.exclude),
      title: stringArg(args.title),
      description: stringArg(args.description),
    })

    if (json) {
      printJson(generated)
      return
    }
    await writeOrPrint(stringArg(args.output), generated.content)
    if (stringArg(args.output)) {
      printKeyValue([
        ['URLs', String(generated.includedUrls)],
        ['Estimated tokens', String(generated.estimatedTokens)],
      ])
    }
  },
})

export const llmsCommand = defineCommand({
  meta: {
    name: 'llms',
    description: 'Check or generate an optional llms.txt file',
  },
  subCommands: {
    audit: llmsAuditCommand,
    generate: llmsGenerateCommand,
  },
})
