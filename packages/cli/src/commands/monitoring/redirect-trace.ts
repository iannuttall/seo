import { readFile, stat } from 'node:fs/promises'
import { redirectTrace, SeoError } from '@seo/core'
import {
  MAX_REDIRECT_HOPS,
  parseRedirectMap,
  REDIRECT_HOP_TIMEOUT_MS,
  REDIRECT_MAP_CONCURRENCY,
  REDIRECT_MAP_MAX_BYTES,
  REDIRECT_MAP_MAX_ROWS,
  type RedirectMapResult,
  type RedirectVerdict,
  traceRedirectMap,
} from '@seo/core/commands'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { printNotes, printReportSummary, truncate } from '../output.js'

export const redirectTraceCommand = defineCommand({
  meta: {
    name: 'redirect-trace',
    description:
      'Trace redirects and report final indexability/canonical issues, or check a redirect map',
  },
  args: {
    url: {
      type: 'string',
      description: 'URL to trace.',
    },
    map: {
      type: 'string',
      description: `CSV of old_url,expected_new_url lines (header optional), or one URL per line. Traces up to ${REDIRECT_MAP_MAX_ROWS.toLocaleString('en-US')} rows, ${REDIRECT_MAP_CONCURRENCY} at a time.`,
    },
    'max-hops': {
      type: 'string',
      description: `Maximum redirect hops to follow, up to ${MAX_REDIRECT_HOPS}. Defaults to ${MAX_REDIRECT_HOPS}.`,
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP cache for final page extraction.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for final page extraction.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const map = stringArg(args.map)
    if (map) {
      await runRedirectMap(args, map)
      return
    }
    const url = stringArg(args.url)
    if (!url) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass --url to trace one URL, or --map with a CSV of old and expected URLs.',
      )
    }
    const report = await redirectTrace({
      url,
      maxHops: numberArg(args['max-hops']),
      refresh: booleanArg(args.refresh),
      js: booleanArg(args.js) ? true : 'auto',
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }

    printReportSummary({
      title: 'Redirect trace',
      target: report.url,
      status:
        report.summary.issues.length > 0 || report.summary.error
          ? 'warning'
          : report.summary.finalIndexable === undefined
            ? 'unknown'
            : 'pass',
      summary: [
        report.summary.error
          ? `${report.summary.outcome === 'timeout' ? 'Timed out' : 'Failed'} at ${report.finalUrl}: ${report.summary.error}`
          : report.summary.issues.length > 0
            ? ''
            : `${report.summary.hops} redirect ${report.summary.hops === 1 ? 'hop' : 'hops'} ended at HTTP ${report.summary.finalStatus}.`,
        report.summary.issues.join(', '),
      ]
        .filter(Boolean)
        .join(' '),
      metrics: [
        { label: 'Final URL', value: report.finalUrl },
        {
          label: 'Final status',
          value: report.summary.finalStatus ?? 'No response',
        },
        {
          label: 'Indexable',
          value:
            report.summary.finalIndexable === undefined
              ? 'Unknown'
              : report.summary.finalIndexable
                ? 'Yes'
                : 'No',
        },
        { label: 'Hops', value: report.summary.hops },
      ],
    })
    printTable(
      ['#', 'Status', 'URL', 'Next'],
      report.chain.map((step, index) => [
        index + 1,
        step.status,
        truncate(step.url, 72),
        truncate(step.nextUrl ?? '-', 72),
      ]),
    )
    if (report.finalPage) {
      process.stdout.write('\nFinal page\n')
      printKeyValue([
        ['Title', report.finalPage.title ?? '-'],
        ['Canonical', report.finalPage.canonical ?? '-'],
        ['Meta robots', report.finalPage.metaRobots ?? '-'],
      ])
    }
    printNotes('Warnings', report.warnings.slice(0, 10))
  },
})

const VERDICT_LABELS: Record<RedirectVerdict, string> = {
  matches: 'matches',
  chain: 'chain',
  redirects: 'redirects',
  wrong_target: 'wrong target',
  not_redirected: 'not redirected',
  loop: 'loop',
  too_many_hops: 'too many hops',
  timeout: 'timeout',
  error: 'error',
}

const HUMAN_MAP_ROWS = 50

// Verdicts that need no change.
const FINE: RedirectVerdict[] = ['matches', 'redirects']

async function writeStdout(text: string): Promise<void> {
  if (process.stdout.write(text)) return
  await new Promise<void>((resolve) => process.stdout.once('drain', resolve))
}

// `seo redirect-trace --map`: every row traced, in input order. --json
// writes one JSON row per line as rows finish, then a summary line.
async function runRedirectMap(
  args: Record<string, unknown>,
  file: string,
): Promise<void> {
  for (const flag of ['url', 'max-hops']) {
    if (stringArg(args[flag]) !== undefined) {
      throw new SeoError('INVALID_INPUT', `--${flag} does not apply to --map.`)
    }
  }
  for (const flag of ['refresh', 'js']) {
    if (args[flag] === true) {
      throw new SeoError('INVALID_INPUT', `--${flag} does not apply to --map.`)
    }
  }
  const size = (await stat(file)).size
  if (size > REDIRECT_MAP_MAX_BYTES) {
    throw new SeoError(
      'INVALID_INPUT',
      `${file} is ${size.toLocaleString('en-US')} bytes. Map mode reads up to ${REDIRECT_MAP_MAX_BYTES.toLocaleString('en-US')} bytes and ${REDIRECT_MAP_MAX_ROWS.toLocaleString('en-US')} rows per run, so split the file.`,
    )
  }
  const rows = parseRedirectMap(await readFile(file, 'utf8'))
  const json = jsonFlag(args)
  const progress = !json && process.stderr.isTTY
  const attention: RedirectMapResult[] = []
  let flagged = 0
  let done = 0
  const summary = await traceRedirectMap(rows, async (row) => {
    done += 1
    if (json) await writeStdout(`${JSON.stringify(row)}\n`)
    else if (!FINE.includes(row.verdict) || row.final_status !== 200) {
      flagged += 1
      if (attention.length < HUMAN_MAP_ROWS) attention.push(row)
    }
    if (progress) process.stderr.write(`\rTraced ${done} of ${rows.length}`)
  })
  if (progress) process.stderr.write('\n')
  if (json) {
    await writeStdout(`${JSON.stringify(summary)}\n`)
    return
  }

  const counts = (Object.keys(VERDICT_LABELS) as RedirectVerdict[])
    .filter((verdict) => summary.verdicts[verdict])
    .map((verdict) => `${summary.verdicts[verdict]} ${VERDICT_LABELS[verdict]}`)
  const fine = FINE.reduce(
    (sum, verdict) => sum + (summary.verdicts[verdict] ?? 0),
    0,
  )
  printReportSummary({
    title: 'Redirect map',
    target: file,
    status:
      fine === summary.rows && !summary.final_not_200 ? 'pass' : 'warning',
    summary: `${summary.rows} rows traced: ${counts.join(', ')}.${summary.final_not_200 ? ` ${summary.final_not_200} ended on a status other than 200.` : ''}`,
    metrics: [
      { label: 'Rows', value: summary.rows },
      ...(Object.keys(VERDICT_LABELS) as RedirectVerdict[])
        .filter((verdict) => summary.verdicts[verdict])
        .map((verdict) => ({
          label: VERDICT_LABELS[verdict],
          value: summary.verdicts[verdict] ?? 0,
        })),
    ],
  })
  if (attention.length) {
    process.stdout.write('\nRows to look at\n')
    printTable(
      ['Line', 'Verdict', 'Hops', 'Status', 'Old URL', 'Ends at'],
      attention.map((row) => [
        row.line,
        VERDICT_LABELS[row.verdict],
        row.hops,
        row.final_status ?? '-',
        truncate(row.url, 50),
        truncate(
          row.error ? `${row.error} at ${row.final_url}` : row.final_url,
          72,
        ),
      ]),
    )
    if (flagged > attention.length) {
      process.stdout.write(
        `Showing the first ${attention.length}. Use --json for every row.\n`,
      )
    }
  }
  process.stdout.write(
    `\nEach hop waits up to ${REDIRECT_HOP_TIMEOUT_MS / 1000}s, up to ${MAX_REDIRECT_HOPS} hops per URL, with the SEO Skill crawler user agent.\n`,
  )
}
