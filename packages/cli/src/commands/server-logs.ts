import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  importServerLog,
  renderServerLogCsv,
  SeoError,
  type ServerLogCsvName,
  serverLogReport,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, strictNumberArg, stringArg } from '../args.js'
import { printJson } from '../utils.js'
import {
  formatCount,
  printLimitedTable,
  printReportSummary,
  truncate,
} from './output.js'

const analyzeCommand = defineCommand({
  meta: {
    name: 'analyze',
    description: 'Stream a local access log into bounded crawler evidence',
  },
  args: {
    file: {
      type: 'string',
      description: 'Local combined, JSONL, or NDJSON access log.',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Input format override: combined or jsonl.',
    },
    'row-limit': {
      type: 'string',
      description: 'Maximum rows to parse. Defaults to 1000000.',
    },
    'path-limit': {
      type: 'string',
      description:
        'Maximum crawler and path aggregates to retain. Defaults to 25000.',
    },
    limit: {
      type: 'string',
      description: 'Maximum crawler path rows returned. Defaults to 100.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    csv: {
      type: 'string',
      description:
        'CSV table: crawler-summary, crawler-paths, crawler-errors, or status-codes.',
    },
    output: {
      type: 'string',
      description: 'Write CSV output to this path instead of stdout.',
    },
  },
  run: async ({ args }) => {
    const file = stringArg(args.file)
    if (!file) throw new SeoError('INVALID_INPUT', 'Pass --file.')
    const json = jsonFlag(args)
    const csvName =
      args.csv === undefined ? undefined : serverLogCsvName(args.csv)
    const output = stringArg(args.output)
    if (json && csvName) {
      throw new SeoError(
        'INVALID_INPUT',
        'Use either --json or --csv, not both.',
      )
    }
    if (output && !csvName) {
      throw new SeoError('INVALID_INPUT', '--output requires --csv.')
    }
    const inputFormat = stringArg(args.format)
    if (inputFormat && !['combined', 'jsonl'].includes(inputFormat)) {
      throw new SeoError('INVALID_INPUT', '--format must be combined or jsonl.')
    }
    const evidence = await importServerLog({
      file,
      format: inputFormat as 'combined' | 'jsonl' | undefined,
      rowLimit: strictNumberArg(args['row-limit'], '--row-limit'),
      pathLimit: strictNumberArg(args['path-limit'], '--path-limit'),
    })
    const report = serverLogReport({
      evidence,
      limit: strictNumberArg(args.limit, '--limit'),
    })
    if (csvName) {
      const csv = renderServerLogCsv(evidence, csvName)
      await writeOrPrint(output, csv.content)
      if (csv.capped) {
        process.stderr.write(
          `Warning: ${csv.omittedRows.toLocaleString()} CSV rows were omitted by the export limit.\n`,
        )
      }
      return
    }
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'Server log report',
      status:
        report.dataStatus === 'complete'
          ? report.summary.invalidRows > 0
            ? 'warning'
            : 'info'
          : 'unknown',
      summary: `${formatCount(report.summary.crawlerRows)} crawler requests found in ${formatCount(report.summary.parsedRows)} parsed requests.`,
      metrics: [
        { label: 'Evidence', value: report.dataStatus },
        {
          label: 'Parsed requests',
          value: formatCount(report.summary.parsedRows),
        },
        {
          label: 'Crawler requests',
          value: formatCount(report.summary.crawlerRows),
        },
        {
          label: 'Crawler families',
          value: formatCount(report.crawlers.length),
        },
        {
          label: 'Invalid rows',
          value: formatCount(report.summary.invalidRows),
        },
        {
          label: 'Returned paths',
          value: `${formatCount(report.selection.returnedCrawlerPaths)} of ${formatCount(report.selection.availableCrawlerPaths)}`,
        },
      ],
    })
    if (report.crawlers.length) {
      process.stdout.write('\nCrawler activity\n')
      printLimitedTable(
        ['Crawler', 'Type', 'Requests', '4xx', '5xx'],
        report.crawlers.map((crawler) => [
          crawler.family,
          crawler.category,
          String(crawler.requests),
          String(crawler.clientError),
          String(crawler.serverError),
        ]),
      )
    }
    if (report.crawlerPaths.length) {
      process.stdout.write('\nCrawler paths\n')
      printLimitedTable(
        ['Crawler', 'Path', 'Requests', '4xx', '5xx'],
        report.crawlerPaths.map((row) => [
          row.family,
          truncate(row.path, 72),
          String(row.requests),
          String(row.clientError),
          String(row.serverError),
        ]),
      )
    }
    for (const warning of report.warnings) {
      process.stdout.write(`\nWarning: ${warning}\n`)
    }
    process.stdout.write(`\nNote: ${report.caveats[0]}\n`)
  },
})

export const serverLogsCommand = defineCommand({
  meta: {
    name: 'server-logs',
    description: 'Analyze local web server access logs',
  },
  subCommands: { analyze: analyzeCommand },
})

function serverLogCsvName(value: unknown): ServerLogCsvName {
  const name = stringArg(value)
  if (
    name &&
    [
      'crawler-summary',
      'crawler-paths',
      'crawler-errors',
      'status-codes',
    ].includes(name)
  ) {
    return name as ServerLogCsvName
  }
  throw new SeoError(
    'INVALID_INPUT',
    'CSV table must be crawler-summary, crawler-paths, crawler-errors, or status-codes.',
  )
}

async function writeOrPrint(path: string | undefined, content: string) {
  if (!path) {
    process.stdout.write(content)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  process.stdout.write(`Wrote ${path}\n`)
}
