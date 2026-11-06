import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  checkSites,
  SeoError,
  SITE_FACTS_MAX_SITES,
  type SiteFactsSummary,
} from '@seo/core'
import { jsonFlag, negatedBooleanArg, numberArg, stringArg } from '../args.js'
import { printKeyValue } from '../utils.js'

// Flags that belong to a single-site crawl.
const SINGLE_SITE_FLAGS = [
  'health',
  'sitemap-url',
  'site',
  'severity',
  'fail-on',
  'csv',
  'max-pages',
  'max-depth',
  'include',
  'exclude',
]

const SUMMARY_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
]

async function writeStdout(text: string): Promise<void> {
  if (process.stdout.write(text)) return
  await new Promise<void>((resolve) => process.stdout.once('drain', resolve))
}

// `seo crawl --mode sites`: one JSON row per site, streamed in input order.
export async function runCrawlSites(
  args: Record<string, unknown>,
  urls: string[],
): Promise<void> {
  const format = stringArg(args.format)
  const json = jsonFlag(args)
  if (format && format !== 'jsonl' && format !== 'pretty') {
    throw new SeoError(
      'INVALID_INPUT',
      'Sites mode writes one JSON row per line. Use --format jsonl (or --json), or --format pretty for counts only.',
    )
  }
  if (json && format === 'pretty') {
    throw new SeoError(
      'INVALID_INPUT',
      'Use either --json or --format, not both.',
    )
  }
  for (const flag of SINGLE_SITE_FLAGS) {
    if (args[flag] !== undefined && args[flag] !== false) {
      throw new SeoError(
        'INVALID_INPUT',
        `--${flag} does not apply to sites mode.`,
      )
    }
  }
  const jsonl = json || format === 'jsonl'
  const output = stringArg(args.output)
  const single = stringArg(args.crawlUrl) ?? stringArg(args.url)
  const sites = single ? [single, ...urls] : urls
  if (!sites.length) {
    throw new SeoError(
      'INVALID_INPUT',
      'No sites given. Pass --urls example.com,example.org or --urls-file with one site per line.',
    )
  }

  if (output) await mkdir(dirname(output), { recursive: true })
  const file = output ? await open(output, 'w') : undefined
  const write = async (text: string) => {
    if (file) await file.write(text)
    else if (jsonl) await writeStdout(text)
  }
  const progress = !jsonl && process.stderr.isTTY
  let done = 0
  let summary: SiteFactsSummary
  try {
    summary = await checkSites({
      sites,
      concurrency: numberArg(args.concurrency),
      respectRobots: !negatedBooleanArg(args, 'robots'),
      onRow: async (row) => {
        await write(`${JSON.stringify(row)}\n`)
        done += 1
        if (progress) process.stderr.write(`\rChecked ${done} sites`)
      },
    })
    if (progress && done) process.stderr.write('\n')
    await write(`${JSON.stringify(summary)}\n`)
  } finally {
    await file?.close()
  }

  if (!jsonl) printSitesSummary(summary, output)
  if (output) process.stdout.write(`Wrote ${output}\n`)
}

function counts(
  label: string,
  facts: SiteFactsSummary['robotsTxt'],
  extra: string[] = [],
): [string, string] {
  return [
    label,
    [
      `${facts.available} found`,
      ...extra,
      `${facts.absent} missing`,
      `${facts['access-blocked']} access blocked`,
      `${facts['rate-limited']} rate limited`,
      `${facts.unreachable} unreachable (${facts.failed} with no response)`,
      ...(facts.unreadable
        ? [
            `${facts.unreadable} answered with a web page, so the rules are unknown`,
          ]
        : []),
    ].join(', '),
  ]
}

function printSitesSummary(
  summary: SiteFactsSummary,
  output: string | undefined,
): void {
  const notes = [
    summary.invalid ? `${summary.invalid} not valid sites` : '',
    summary.duplicatesRemoved
      ? `${summary.duplicatesRemoved} duplicates removed`
      : '',
  ].filter(Boolean)
  const home = summary.homepage
  printKeyValue([
    [
      'Sites',
      `${summary.checked} checked of ${summary.sites}${notes.length ? ` (${notes.join(', ')})` : ''}. Limit ${SITE_FACTS_MAX_SITES.toLocaleString('en-US')} per run.`,
    ],
    counts('robots.txt', summary.robotsTxt),
    [
      'Home page',
      [
        `${home.available} answered 2xx`,
        `${home.absent} answered 4xx`,
        `${home['access-blocked']} access blocked`,
        `${home['rate-limited']} rate limited`,
        `${home.unreachable} unreachable (${home.failed} with no response)`,
        `${home.skipped} not requested because robots.txt disallows it or could not be read`,
      ].join(', '),
    ],
    counts('llms.txt', summary.llmsTxt, [
      `${summary.llmsTxt.startsWithH1} start with an H1`,
    ]),
    ...summary.botAccess
      .filter((bot) => SUMMARY_BOTS.includes(bot.userAgent))
      .map((bot): [string, string] => [
        bot.userAgent,
        `${bot.blocked} block it in robots.txt, ${bot.allowed} allow it, ${bot.unknown} unknown (robots.txt not read)`,
      ]),
    [
      'Run',
      `${summary.status}, ${Math.round(summary.durationMs / 1000)}s, ${summary.concurrency} sites at a time, ${summary.timeoutMs / 1000}s per request`,
    ],
  ])
  if (!output) {
    process.stdout.write(
      '\nAdd --json for one row per site, or --output <file> to save the rows.\n',
    )
  }
}
