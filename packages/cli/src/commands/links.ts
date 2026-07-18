import {
  bingWebmasterSiteUrl,
  type CollectedLinkEvidence,
  collectBingLinkEvidence,
  importLinkEvidence,
  linkEvidenceReport,
  SeoError,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, projectArg, strictNumberArg, stringArg } from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson, printKeyValue } from '../utils.js'
import { formatCount, printLimitedTable, truncate } from './output.js'

export const linksCommand = defineCommand({
  meta: {
    name: 'links',
    description: 'Review bounded referring-link evidence from Bing or a file',
  },
  args: {
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    site: { type: 'string', description: 'Verified Bing Webmaster site URL.' },
    file: {
      type: 'string',
      description: 'Local CSV, JSON, JSONL, or NDJSON link export.',
    },
    format: {
      type: 'string',
      description: 'Import format override: csv, json, or jsonl.',
    },
    'row-limit': {
      type: 'string',
      description:
        'Maximum imported or Bing link rows. Defaults to 500 for Bing and 10000 for files.',
    },
    'target-limit': {
      type: 'string',
      description: 'Maximum Bing target pages to inspect. Defaults to 20.',
    },
    'detail-pages': {
      type: 'string',
      description: 'Maximum Bing result pages per target. Defaults to 1.',
    },
    limit: {
      type: 'string',
      description: 'Maximum link rows returned. Defaults to 100.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const file = stringArg(args.file)
    const format = stringArg(args.format)
    if (format && !['csv', 'json', 'jsonl'].includes(format)) {
      throw new SeoError(
        'INVALID_INPUT',
        '--format must be csv, json, or jsonl.',
      )
    }
    const rowLimit = strictNumberArg(args['row-limit'], '--row-limit')
    let evidence: CollectedLinkEvidence
    if (file) {
      evidence = await importLinkEvidence({
        file,
        format: format as 'csv' | 'json' | 'jsonl' | undefined,
        rowLimit,
      })
    } else {
      const project = await resolveClient({
        project: projectArg(args),
        options: { json },
      })
      const site = stringArg(args.site) ?? bingWebmasterSiteUrl(project)
      if (!site) {
        throw new SeoError(
          'INVALID_INPUT',
          'Pass --site, connect Bing to a saved project, or import a link file with --file.',
        )
      }
      evidence = await collectBingLinkEvidence({
        site,
        rowLimit,
        targetLimit: strictNumberArg(args['target-limit'], '--target-limit'),
        detailPagesPerTarget: strictNumberArg(
          args['detail-pages'],
          '--detail-pages',
        ),
      })
    }
    const report = linkEvidenceReport({
      evidence,
      limit: strictNumberArg(args.limit, '--limit'),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Source', report.provenance.provider],
      ['Evidence', report.dataStatus],
      ['Observed links', formatCount(report.summary.observedLinks)],
      ['Referring domains', formatCount(report.summary.referringDomains)],
      ['Target pages', formatCount(report.summary.targetPages)],
      [
        'Returned rows',
        `${formatCount(report.selection.returnedRows)} of ${formatCount(report.selection.availableRows)}`,
      ],
    ])
    if (report.links.length) {
      printLimitedTable(
        ['Source', 'Target', 'Anchor'],
        report.links.map((link) => [
          truncate(link.sourceUrl, 58),
          truncate(link.targetUrl, 58),
          truncate(link.anchorText ?? '', 36),
        ]),
      )
    }
    for (const warning of report.warnings) {
      process.stdout.write(`\nWarning: ${warning}\n`)
    }
    process.stdout.write(`\nNote: ${report.caveats[0]}\n`)
  },
})
