import {
  buildOkfBundle,
  explainOkfValidation,
  okfConceptLimit,
  validateOkfFiles,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, strictNumberArg, stringArg } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { readOkfMarkdownFiles, writeOkfDirectory } from './okf-files.js'
import { resolveSavedCrawlReport } from './readiness.js'

function printValidation(
  filesPath: string,
  validation: ReturnType<typeof validateOkfFiles>,
) {
  process.stdout.write(`OKF validation for ${filesPath}\n\n`)
  printKeyValue([
    ['Valid', validation.valid ? 'yes' : 'no'],
    ['Files', String(validation.files)],
    ['Concepts', String(validation.concepts)],
    [
      'Errors',
      String(
        validation.issues.filter((issue) => issue.severity === 'error').length,
      ),
    ],
    [
      'Warnings',
      String(
        validation.issues.filter((issue) => issue.severity === 'warning')
          .length,
      ),
    ],
  ])
  if (validation.issues.length) {
    process.stdout.write('\nIssues\n')
    printTable(
      ['Severity', 'Path', 'Message'],
      validation.issues
        .slice(0, 25)
        .map((issue) => [issue.severity, issue.path, issue.message]),
    )
  }
}

export const okfExportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export a saved crawl as an OKF bundle',
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
    output: {
      type: 'string',
      description: 'Output directory. Defaults to ./okf.',
    },
    'max-concepts': {
      type: 'string',
      description: 'Maximum concept files to export. Defaults to 500.',
    },
    title: {
      type: 'string',
      description: 'Override the root bundle title.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const maxConcepts = okfConceptLimit(
      strictNumberArg(args['max-concepts'], '--max-concepts'),
    )
    const report = await resolveSavedCrawlReport(args, { json })
    const bundle = buildOkfBundle(report, {
      maxConcepts,
      title: stringArg(args.title),
    })
    const output = stringArg(args.output) ?? './okf'
    const validation = await writeOkfDirectory(output, bundle.files)
    if (json) {
      printJson({ output, bundle, validation })
      return
    }
    process.stdout.write(`Wrote OKF bundle to ${output}\n\n`)
    printKeyValue([
      ['Files', String(bundle.files.length)],
      ['Concepts', String(bundle.conceptCount)],
      ['Valid', validation.valid ? 'yes' : 'no'],
    ])
  },
})

export const okfValidateCommand = defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate an OKF bundle directory',
  },
  args: {
    path: {
      type: 'positional',
      required: true,
      description: 'OKF bundle directory.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const path = stringArg(args.path)
    if (!path) throw new Error('Pass an OKF bundle directory.')
    const files = await readOkfMarkdownFiles(path)
    const validation = validateOkfFiles(files)
    if (!validation.valid) process.exitCode = 1
    if (jsonFlag(args)) {
      printJson(validation)
      return
    }
    printValidation(path, validation)
  },
})

export const okfExplainCommand = defineCommand({
  meta: {
    name: 'explain',
    description: 'Explain OKF validation results in plain English',
  },
  args: {
    path: {
      type: 'positional',
      required: true,
      description: 'OKF bundle directory.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const path = stringArg(args.path)
    if (!path) throw new Error('Pass an OKF bundle directory.')
    const validation = validateOkfFiles(await readOkfMarkdownFiles(path))
    const explanation = explainOkfValidation(validation)
    if (!explanation.valid) process.exitCode = 1
    if (jsonFlag(args)) {
      printJson(explanation)
      return
    }
    process.stdout.write(`${explanation.summary}\n\n`)
    printKeyValue([
      ['Valid', explanation.valid ? 'yes' : 'no'],
      ['Files', String(explanation.files)],
      ['Concepts', String(explanation.concepts)],
      ['Errors', String(explanation.errors)],
      ['Warnings', String(explanation.warnings)],
    ])
    if (explanation.nextActions.length) {
      process.stdout.write('\nNext actions\n')
      for (const action of explanation.nextActions) {
        process.stdout.write(`- ${action}\n`)
      }
    }
  },
})

export const okfCommand = defineCommand({
  meta: {
    name: 'okf',
    description: 'Export, validate, and explain OKF site knowledge bundles',
  },
  subCommands: {
    export: okfExportCommand,
    validate: okfValidateCommand,
    explain: okfExplainCommand,
  },
})
