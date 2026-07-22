import { randomUUID } from 'node:crypto'
import {
  bingWebmasterSiteUrl,
  type CollectedLinkEvidence,
  collectBingLinkEvidence,
  collectDataForSeoLinkEvidence,
  importLinkEvidence,
  linkEvidenceReport,
  linkTargetContext,
  SeoError,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  projectArg,
  strictNumberArg,
  stringArg,
} from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson } from '../utils.js'
import {
  formatCount,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from './output.js'

export const linksCommand = defineCommand({
  meta: {
    name: 'links',
    description:
      'Review bounded referring-link evidence from DataForSEO, Bing or a file',
  },
  args: {
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    site: { type: 'string', description: 'Verified Bing Webmaster site URL.' },
    provider: {
      type: 'string',
      description: 'Live link source: dataforseo or bing.',
    },
    target: {
      type: 'string',
      description: 'Domain or absolute page URL for DataForSEO.',
    },
    scope: {
      type: 'string',
      description: 'DataForSEO target scope: domain or page.',
    },
    'include-subdomains': {
      type: 'boolean',
      default: true,
      description: 'Include subdomains for a DataForSEO domain target.',
    },
    'search-site': {
      type: 'string',
      description:
        'Search Console property used to add target-page search evidence.',
    },
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
        'Maximum source rows. Defaults: 100 DataForSEO, 500 Bing, 10000 files.',
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
    days: {
      type: 'string',
      description:
        'Search Console lookback window for linked target pages. Defaults to 90.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local provider and Search Console caches.',
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
    const provider = stringArg(args.provider)
    if (provider && !['dataforseo', 'bing'].includes(provider)) {
      throw new SeoError(
        'INVALID_INPUT',
        '--provider must be dataforseo or bing.',
      )
    }
    if (file && provider) {
      throw new SeoError(
        'INVALID_INPUT',
        'Do not pass --provider with a local link file.',
      )
    }
    const scope = stringArg(args.scope)
    if (scope && scope !== 'domain' && scope !== 'page') {
      throw new SeoError('INVALID_INPUT', '--scope must be domain or page.')
    }
    if (format && !['csv', 'json', 'jsonl'].includes(format)) {
      throw new SeoError(
        'INVALID_INPUT',
        '--format must be csv, json, or jsonl.',
      )
    }
    const rowLimit = strictNumberArg(args['row-limit'], '--row-limit')
    const target = stringArg(args.target)
    const site = stringArg(args.site)
    if (file && (site || target)) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass one link source: --file, --site for Bing, or --target for DataForSEO.',
      )
    }
    if (site && target) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass --site for Bing or --target for DataForSEO, not both.',
      )
    }
    if (target && provider === 'bing') {
      throw new SeoError(
        'INVALID_INPUT',
        'Use --site with Bing or --target with DataForSEO.',
      )
    }
    if (site && provider === 'dataforseo') {
      throw new SeoError(
        'INVALID_INPUT',
        'Use --target with DataForSEO or --site with Bing.',
      )
    }
    const savedProject = projectArg(args)
    let project = savedProject
      ? await resolveClient({ project: savedProject, options: { json } })
      : undefined
    if (!file && !project && !target) {
      project = await resolveClient({ options: { json } })
    }
    let evidence: CollectedLinkEvidence
    if (file) {
      evidence = await importLinkEvidence({
        file,
        format: format as 'csv' | 'json' | 'jsonl' | undefined,
        rowLimit,
      })
    } else if (provider === 'dataforseo' || target) {
      const providerTarget =
        target ??
        project?.startUrl ??
        project?.siteUrl.replace(/^sc-domain:/u, '')
      if (!providerTarget) {
        throw new SeoError(
          'INVALID_INPUT',
          'Pass --target or use a saved project with a crawl URL or Search Console property.',
        )
      }
      evidence = await collectDataForSeoLinkEvidence({
        target: providerTarget,
        scope: scope as 'domain' | 'page' | undefined,
        includeSubdomains: booleanArg(args['include-subdomains']),
        rowLimit,
        refresh: booleanArg(args.refresh),
        context: {
          projectId: project?.id,
          reportId: 'link-evidence',
          reportRunId: randomUUID(),
        },
      })
    } else {
      const bingSite = site ?? bingWebmasterSiteUrl(project)
      if (!bingSite) {
        throw new SeoError(
          'INVALID_INPUT',
          'Pass --site, connect Bing to a saved project, or import a link file with --file.',
        )
      }
      evidence = await collectBingLinkEvidence({
        site: bingSite,
        rowLimit,
        targetLimit: strictNumberArg(args['target-limit'], '--target-limit'),
        detailPagesPerTarget: strictNumberArg(
          args['detail-pages'],
          '--detail-pages',
        ),
      })
    }
    const searchConsoleSite = stringArg(args['search-site']) ?? project?.siteUrl
    const targetPageContext =
      project ||
      searchConsoleSite ||
      evidence.provenance.provider === 'dataforseo'
        ? await linkTargetContext({
            evidence,
            searchConsoleSite,
            crawlSite:
              project?.siteUrl ??
              searchConsoleSite ??
              (evidence.provenance.provider === 'dataforseo'
                ? evidence.externalProvider?.summary.data.target
                : undefined),
            days: strictNumberArg(args.days, '--days'),
            refresh: booleanArg(args.refresh),
          })
        : undefined
    const report = linkEvidenceReport({
      evidence,
      limit: strictNumberArg(args.limit, '--limit'),
      targetContext: targetPageContext,
    })
    if (json) {
      printJson(report)
      return
    }
    const providerCosts = report.providerEvidence
      ? [
          report.providerEvidence.summary.cost.actualMicros,
          report.providerEvidence.backlinks.cost.actualMicros,
        ]
      : []
    const providerCost = providerCosts.every(
      (value): value is number => value !== null,
    )
      ? providerCosts.reduce((total, value) => total + value, 0)
      : null
    const providerCached = report.providerEvidence
      ? [
          report.providerEvidence.summary.cache.status,
          report.providerEvidence.backlinks.cache.status,
        ].every((status) => status === 'hit')
      : false
    printReportSummary({
      title: 'Inbound link evidence',
      target: report.provenance.provider,
      status: report.dataStatus === 'complete' ? 'info' : 'unknown',
      summary: `${formatCount(report.summary.observedLinks)} retained links from ${formatCount(report.summary.referringDomains)} referring domains.`,
      metrics: [
        { label: 'Evidence', value: report.dataStatus },
        {
          label: 'Observed links',
          value: formatCount(report.summary.observedLinks),
        },
        {
          label: 'Referring domains',
          value: formatCount(report.summary.referringDomains),
        },
        {
          label: 'Target pages',
          value: formatCount(report.summary.targetPages),
        },
        {
          label: 'Returned rows',
          value: `${formatCount(report.selection.returnedRows)} of ${formatCount(report.selection.availableRows)}`,
        },
        ...(report.providerSummary?.backlinks.state === 'observed'
          ? [
              {
                label: 'Provider backlinks',
                value: formatCount(report.providerSummary.backlinks.value),
              },
            ]
          : []),
        ...(report.providerSummary?.referringDomains.state === 'observed'
          ? [
              {
                label: 'Provider domains',
                value: formatCount(
                  report.providerSummary.referringDomains.value,
                ),
              },
            ]
          : []),
        ...(report.providerEvidence
          ? [
              {
                label: 'Provider cost',
                value:
                  providerCost === null
                    ? 'Unknown'
                    : `$${(providerCost / 1_000_000).toFixed(4)}${providerCached ? ' (cached)' : ''}`,
              },
            ]
          : []),
        ...(report.providerSummary?.brokenBacklinks.state === 'observed' &&
        report.providerSummary.brokenBacklinks.value > 0
          ? [
              {
                label: 'Provider broken links',
                value: formatCount(
                  report.providerSummary.brokenBacklinks.value,
                ),
              },
            ]
          : []),
      ],
    })
    if (report.findings.length) {
      printLimitedTable(
        ['Priority', 'Finding', 'Target'],
        report.findings.map((finding) => [
          finding.priority,
          finding.code,
          truncate(finding.targetUrl, 72),
        ]),
      )
    }
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
    printNotes('Warnings', report.warnings)
    printNotes('Report caveats', report.caveats)
  },
})
