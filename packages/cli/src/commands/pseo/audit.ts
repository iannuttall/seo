import { countLabel, pseoAuditReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, projectArg, stringArg } from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  formatPosition,
  printLimitedTable,
  printNextCommand,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { pseoOptions } from './options.js'

function formatInspection(input: {
  indexed: number
  notIndexed: number
  unknown: number
  warnings: number
}): string {
  const total =
    input.indexed + input.notIndexed + input.unknown + input.warnings
  if (!total) return '-'
  return `${input.indexed}/${total} indexed`
}

function formatCrawl(input: {
  samples: unknown[]
  blockedOrFailed: number
  usable: number
  medianWordCount?: number
  weakQueryCoverage?: number
}): string {
  if (!input.samples.length) return '-'
  const words =
    input.medianWordCount === undefined
      ? 'words ?'
      : `${formatCount(input.medianWordCount)} words`
  const weak = input.weakQueryCoverage
    ? `; ${input.weakQueryCoverage} weak coverage`
    : ''
  return `${words}; ${input.usable}/${input.samples.length} usable${weak}`
}

function formatCoverage(classification: string): string {
  if (classification === 'serp-framing-review') return 'wording review'
  if (classification === 'body-term-review') return 'literal term review'
  return 'covered terms'
}

function formatTemplateShape(
  shape: Awaited<
    ReturnType<typeof pseoAuditReport>
  >['templates'][number]['shape'],
): string {
  const staticPath = shape.staticSegments
    .map((segment) => `/${segment.value}`)
    .join('')
  const variables = shape.variableSegments.slice(0, 3).map((segment) => {
    const examples = segment.examples.slice(0, 3).join(', ')
    return `${segment.placeholder}@${segment.index + 1}${examples ? ` (${examples})` : ''}`
  })
  return [
    staticPath ? `static ${staticPath}` : 'no fixed path prefix',
    variables.length ? `variables ${variables.join('; ')}` : 'no variables',
  ].join('; ')
}

function formatEntityFit(
  fit: Awaited<
    ReturnType<typeof pseoAuditReport>
  >['templates'][number]['metrics']['entityFit'],
): string | undefined {
  if (!fit.checkedQueries) return undefined
  return `${Math.round(fit.impressionShare * 100)}% impression fit across ${countLabel(fit.checkedQueries, 'checked query/page row')}`
}

function formatDemandLabel(label: string): string {
  if (label.startsWith('theme: ')) {
    return `${label.slice('theme: '.length)}-related`
  }
  if (label === 'general') return 'broad'
  return label
}

function printTemplateDetails(
  templates: Awaited<ReturnType<typeof pseoAuditReport>>['templates'],
): void {
  for (const template of templates.slice(0, 5)) {
    process.stdout.write(`\n${template.signature}\n`)
    if (template.evidence.length) {
      process.stdout.write(`  Evidence: ${template.evidence.join('; ')}.\n`)
    }
    process.stdout.write(`  Shape: ${formatTemplateShape(template.shape)}\n`)
    const entityFit = formatEntityFit(template.metrics.entityFit)
    if (entityFit) {
      process.stdout.write(`  Entity fit: ${entityFit}\n`)
    }
    const patterns = template.metrics.queryPatterns
      .slice(0, 3)
      .map(
        (pattern) =>
          `${formatDemandLabel(pattern.label)} (${formatCount(pattern.impressions)} impr: ${pattern.examples
            .slice(0, 2)
            .join('; ')})`,
      )
    if (patterns.length) {
      process.stdout.write(`  Demand: ${patterns.join(' | ')}\n`)
    }
    const topQueries = template.metrics.topQueries.slice(0, 3)
    if (topQueries.length) {
      process.stdout.write('  Top queries:\n')
      for (const query of topQueries) {
        process.stdout.write(
          `    - ${truncate(query.query, 72)} (${formatCount(query.impressions)} impr, pos ${formatPosition(query.position)})\n`,
        )
      }
    }
    const coverage = template.crawl.samples
      .map((sample) => sample.queryCoverage)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 3)
    if (coverage.length) {
      process.stdout.write('  Sample coverage:\n')
      for (const item of coverage) {
        const missing = item.missingTerms.length
          ? ` missing ${item.missingTerms.slice(0, 4).join(', ')}`
          : ''
        process.stdout.write(
          `    - ${formatCoverage(item.classification)}: ${truncate(item.query, 64)} (body ${(item.bodyCoverage * 100).toFixed(0)}%${missing})\n`,
        )
      }
    }
    const weakEntityExamples = template.metrics.entityFit.weakExamples.slice(
      0,
      2,
    )
    if (weakEntityExamples.length) {
      process.stdout.write('  Weak entity-fit examples:\n')
      for (const item of weakEntityExamples) {
        const terms = item.pathTerms.slice(0, 4)
        process.stdout.write(
          `    - ${truncate(item.query, 64)} -> expected ${countLabel(terms.length, 'path term')}: ${terms.join(', ')}\n`,
        )
      }
    }
    process.stdout.write(`  Action: ${template.recommendation}\n`)
  }
}

export const pseoAuditCommand = defineCommand({
  meta: {
    name: 'audit',
    description:
      'Group GSC/sitemap URLs into pSEO templates, then sample pages for crawl and index evidence',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs(['days', 'limit', 'includeBrand', 'js', 'refresh'], {
      limit: {
        description: 'Maximum templates to show. Defaults to 25.',
      },
      includeBrand: {
        description: 'Include branded queries in template metrics.',
      },
      js: {
        description: 'Force JavaScript rendering for crawl samples.',
      },
      refresh: {
        description: 'Bypass local GSC and HTTP cache.',
      },
    }),
    sitemap: {
      type: 'string',
      description:
        'Comma-separated sitemap URLs to include in template counts.',
    },
    'crawl-samples': {
      type: 'string',
      description:
        'Sample URLs to fetch per detected template. This is not crawl depth.',
    },
    'inspect-samples': {
      type: 'string',
      description:
        'Sample URLs to check per detected template with URL Inspection.',
    },
    'max-sitemap-urls': {
      type: 'string',
      description: 'Maximum discovered URLs per sitemap. Defaults to 50000.',
    },
    'minimum-template-urls': {
      type: 'string',
      description:
        'Minimum repeated URLs required for a template. Defaults to 3.',
    },
    'minimum-template-share': {
      type: 'string',
      description:
        'Minimum share of discovered URLs from 0 to 1. Defaults to 0.',
    },
    'minimum-template-impressions': {
      type: 'string',
      description:
        'Minimum retained page impressions for a template. Defaults to 0.',
    },
    'brand-terms': {
      type: 'string',
      description:
        'Comma-separated brand terms to exclude from query evidence.',
    },
    'fetch-concurrency': {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const options = pseoOptions(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await pseoAuditReport({
      site: selection.site,
      ...options,
      brandTerms: options.brandTerms ?? selection.client?.brandTerms,
      progress: createProgressReporter(!json),
    })

    if (json) {
      printJson(report)
      return
    }

    printReportSummary({
      title: 'Programmatic SEO audit',
      target: report.site,
      status: report.templates.length > 0 ? 'info' : 'unknown',
      summary:
        report.templates.length > 0
          ? `${formatCount(report.summary.templates)} page templates were analysed.`
          : 'No page templates could be established from the available evidence.',
      metrics: [
        { label: 'Templates', value: formatCount(report.summary.templates) },
        { label: 'GSC pages', value: formatCount(report.summary.gscPages) },
        {
          label: 'Sitemap URLs',
          value: formatCount(report.summary.sitemapUrls),
        },
        { label: 'Clicks', value: formatCount(report.summary.clicks) },
        {
          label: 'Impressions',
          value: formatCount(report.summary.impressions),
        },
        {
          label: 'Usable crawls',
          value: `${formatCount(report.summary.crawledUrls)}/${formatCount(report.summary.crawlAttempts)}`,
        },
        {
          label: 'Inspections',
          value: `${formatCount(report.summary.inspectedUrls)}/${formatCount(report.summary.inspectionAttempts)}`,
        },
      ],
    })
    printNotes('Report caveats', report.caveats)

    if (!report.templates.length) {
      process.stdout.write('No pSEO templates found from GSC/sitemap data.\n')
      return
    }

    printLimitedTable(
      [
        'Verdict',
        'Template',
        'URLs',
        'Clicks',
        'Impr',
        'CTR',
        'Pos',
        'Index',
        'Crawl',
        'Action',
      ],
      report.templates.map((template) => [
        `${template.verdict} (${template.confidence})`,
        truncate(template.signature, 28),
        formatCount(template.urlCount),
        formatCount(template.metrics.clicks),
        formatCount(template.metrics.impressions),
        formatPercent(template.metrics.ctr),
        template.metrics.position.toFixed(1),
        formatInspection(template.inspection),
        formatCrawl(template.crawl),
        truncate(template.recommendation, 72),
      ]),
    )

    printTemplateDetails(report.templates)

    if (report.warnings.length) {
      process.stdout.write(`Warnings: ${report.warnings.join('; ')}\n`)
    }
    const target = selection.client
      ? `--project ${JSON.stringify(selection.client.id)}`
      : `--site ${JSON.stringify(selection.site)}`
    printNextCommand(`seo export pseo ${target}`)
  },
})
