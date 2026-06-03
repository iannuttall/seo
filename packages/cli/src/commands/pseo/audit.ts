import { pseoAuditReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  formatPosition,
  printLimitedTable,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { formatContentCheck } from '../shared.js'

function csv(value?: string): string[] | undefined {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatInspection(input: {
  indexed: number
  notIndexed: number
  warnings: number
}): string {
  const total = input.indexed + input.notIndexed + input.warnings
  if (!total) return '-'
  return `${input.indexed}/${total} indexed`
}

function formatCrawl(input: {
  samples: unknown[]
  blockedOrFailed: number
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
  return `${words}; ${input.blockedOrFailed}/${input.samples.length} blocked/failed${weak}`
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
  return `${Math.round(fit.impressionShare * 100)}% impression fit across ${fit.checkedQueries} checked query/page row(s)`
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
          `${pattern.label} (${formatCount(pattern.impressions)} impr: ${pattern.examples
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
          `    - ${formatContentCheck(item.classification)}: ${truncate(item.query, 64)} (body ${(item.bodyCoverage * 100).toFixed(0)}%${missing})\n`,
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
        process.stdout.write(
          `    - ${truncate(item.query, 64)} -> expected path term(s): ${item.pathTerms
            .slice(0, 4)
            .join(', ')}\n`,
        )
      }
    }
    process.stdout.write(`  Action: ${template.recommendation}\n`)
  }
}

export const pseoAuditCommand = defineCommand({
  meta: {
    name: 'audit',
    description: 'Audit pSEO templates with GSC, crawl, and index evidence',
  },
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
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
      description: 'Pages to fetch per template for content/fetch checks.',
    },
    'inspect-samples': {
      type: 'string',
      description: 'URLs to check per template with URL Inspection.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await pseoAuditReport({
      site: selection.site,
      days: numberArg(args.days),
      sitemaps: csv(stringArg(args.sitemap)),
      templateLimit: numberArg(args.limit),
      crawlSamples: numberArg(args['crawl-samples']),
      inspectSamples: numberArg(args['inspect-samples']),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      js: booleanArg(args.js) ? true : 'auto',
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.site],
      ['Templates', formatCount(report.summary.templates)],
      ['GSC pages', formatCount(report.summary.gscPages)],
      ['Sitemap URLs', formatCount(report.summary.sitemapUrls)],
      ['Clicks', formatCount(report.summary.clicks)],
      ['Impressions', formatCount(report.summary.impressions)],
      ['Crawled URLs', formatCount(report.summary.crawledUrls)],
      ['Inspected URLs', formatCount(report.summary.inspectedUrls)],
    ])

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
  },
})
