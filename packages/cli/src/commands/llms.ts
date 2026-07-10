import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { auditLlmsTxt, generateLlmsTxt } from '@seo/core'
import { defineCommand } from 'citty'
import { csvArg, jsonFlag, numberArg, stringArg } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printNotes, truncate } from './output.js'
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
  json: {
    type: 'boolean',
    default: false,
    description: 'Print machine-readable JSON.',
  },
} as const

export const llmsAuditCommand = defineCommand({
  meta: {
    name: 'audit',
    description: 'Inspect optional llms.txt presence from a saved crawl',
  },
  args: sharedArgs,
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await resolveSavedCrawlReport(args, { json })
    const audit = auditLlmsTxt(report)
    if (json) {
      printJson(audit)
      return
    }

    process.stdout.write(`llms.txt audit for ${audit.url}\n\n`)
    printKeyValue([
      ['SEO impact', audit.googleSearchImpact],
      ['Optional', audit.optional ? 'yes' : 'no'],
      ['Found', audit.exists ? 'yes' : 'no'],
      ['URL', audit.llmsTxtUrl],
      ['Status', audit.status ? String(audit.status) : '-'],
    ])
    process.stdout.write(`\n${audit.headline}\n`)
    if (audit.issues.length) {
      process.stdout.write('\nIssues\n')
      printTable(
        ['Severity', 'Issue', 'Action'],
        audit.issues.map((issue) => [
          issue.severity,
          issue.title,
          truncate(issue.action, 96),
        ]),
      )
    }
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
    description: 'Generate an llms.txt draft from a saved crawl',
  },
  args: {
    ...sharedArgs,
    output: {
      type: 'string',
      description: 'Write llms.txt to this path instead of stdout.',
    },
    'max-urls': {
      type: 'string',
      description: 'Maximum URLs to include. Defaults to 250.',
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
    const report = await resolveSavedCrawlReport(args, { json })
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
    description: 'Inspect or generate optional llms.txt from saved crawl data',
  },
  subCommands: {
    audit: llmsAuditCommand,
    generate: llmsGenerateCommand,
  },
})
