import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  aiReadiness,
  auditLlmsTxt,
  buildOkfBundle,
  type CrawlReport,
  entityReadiness,
  type OkfFile,
  validateOkfFiles,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue } from '../../utils.js'
import { resolveSavedCrawlReport } from '../readiness.js'

type KnowledgeFormat = 'okf' | 'markdown' | 'json'

async function writeOrPrint(path: string | undefined, content: string) {
  if (!path) {
    process.stdout.write(content)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  process.stdout.write(`Wrote ${path}\n`)
}

async function writeOkfFiles(outDir: string, files: OkfFile[]): Promise<void> {
  await mkdir(outDir, { recursive: true })
  for (const file of files) {
    const path = join(outDir, file.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, file.content)
  }
}

function formatArg(value: unknown): KnowledgeFormat {
  const format = stringArg(value) ?? 'okf'
  if (['okf', 'markdown', 'json'].includes(format)) {
    return format as KnowledgeFormat
  }
  throw new Error('Format must be one of: okf, markdown, json.')
}

function knowledgePayload(report: CrawlReport) {
  return {
    reportId: report.id,
    url: report.config.url,
    generatedAt: new Date().toISOString(),
    crawl: {
      summary: report.summary,
      caveats: report.caveats,
      warnings: report.warnings,
      pages: report.pages.map((page) => ({
        url: page.finalUrl,
        title: page.title,
        metaDescription: page.metaDescription,
        status: page.status,
        indexable: page.indexable,
        wordCount: page.wordCount,
        schemaTypes: page.schemaTypes,
        sameAs: page.schemaSameAs,
        internalInlinks: page.internalInlinkCount,
        contentSample: page.contentSample,
      })),
    },
    aiReadiness: aiReadiness(report),
    entityReadiness: entityReadiness(report),
    llmsTxt: auditLlmsTxt(report),
  }
}

function renderKnowledgeMarkdown(report: CrawlReport): string {
  const payload = knowledgePayload(report)
  const lines = [
    `# Site Knowledge Export`,
    '',
    `Source: ${report.config.url}`,
    `Crawl report: ${report.id}`,
    `Generated: ${payload.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Pages: ${report.summary.totalPages}`,
    `- Indexable pages: ${report.summary.indexablePages}`,
    `- Technical score: ${report.summary.healthScore}/100`,
    `- GEO score: ${report.summary.geoReadinessScore}/100`,
    `- AI readiness: ${payload.aiReadiness.score}/100`,
    `- Entity readiness: ${payload.entityReadiness.score}/100`,
    '',
    '## Top AI Readiness Actions',
    '',
    ...(payload.aiReadiness.topActions.length
      ? payload.aiReadiness.topActions.map(
          (action) => `- ${action.title}: ${action.action}`,
        )
      : ['- No top AI readiness actions.']),
    '',
    '## Entity Signals',
    '',
    `- sameAs profiles: ${payload.entityReadiness.entities.sameAs.length}`,
    `- Social profiles: ${payload.entityReadiness.entities.socialProfiles.length}`,
    `- Authors: ${payload.entityReadiness.entities.authors.length}`,
    '',
    '## Important Pages',
    '',
    ...report.pages
      .filter((page) => page.indexable && page.status < 400)
      .slice(0, 100)
      .map(
        (page) =>
          `- [${page.title ?? page.finalUrl}](${page.finalUrl}) - ${page.metaDescription ?? page.contentSample ?? 'No summary available.'}`,
      ),
    '',
    '# Citations',
    '',
    `- [Crawl start URL](${report.config.url})`,
    '',
  ]
  return `${lines.join('\n')}\n`
}

export const exportKnowledgeCommand = defineCommand({
  meta: {
    name: 'knowledge',
    description:
      'Export site knowledge from a saved crawl as OKF, Markdown, or JSON',
  },
  args: {
    'report-id': {
      type: 'string',
      description: 'Saved crawl report id to export.',
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
    format: {
      type: 'string',
      description: 'Output format: okf, markdown, or json. Defaults to okf.',
    },
    output: {
      type: 'string',
      description:
        'Output directory for OKF, or output file for Markdown/JSON.',
    },
    'max-concepts': {
      type: 'string',
      description: 'Maximum OKF concept files. Defaults to 500.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print command metadata as JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const format = formatArg(args.format)
    const report = await resolveSavedCrawlReport(args, { json })
    const output = stringArg(args.output)

    if (format === 'okf') {
      const bundle = buildOkfBundle(report, {
        maxConcepts: numberArg(args['max-concepts']),
      })
      const outDir = output ?? './okf'
      await writeOkfFiles(outDir, bundle.files)
      const validation = validateOkfFiles(bundle.files)
      if (json) {
        printJson({ format, output: outDir, bundle, validation })
        return
      }
      process.stdout.write(`Wrote OKF bundle to ${outDir}\n\n`)
      printKeyValue([
        ['Files', String(bundle.files.length)],
        ['Concepts', String(bundle.conceptCount)],
        ['Valid', validation.valid ? 'yes' : 'no'],
      ])
      return
    }

    if (format === 'json') {
      const content = `${JSON.stringify(knowledgePayload(report), null, 2)}\n`
      await writeOrPrint(output, content)
      return
    }

    await writeOrPrint(output, renderKnowledgeMarkdown(report))
  },
})
