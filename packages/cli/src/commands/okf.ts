import {
  buildOkfBundle,
  explainOkfValidation,
  type OkfValidationProfile,
  okfConceptLimit,
  SeoError,
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
    ['Version', validation.formatVersion ?? 'not declared'],
    ['Compatibility', validation.compatibility],
    ['Profile', validation.profile],
    ['Valid', validation.valid ? 'yes' : 'no'],
    ['Files', String(validation.files)],
    ['Concepts', String(validation.concepts)],
    ['Errors', String(validation.issueCounts.errors)],
    ['Warnings', String(validation.issueCounts.warnings)],
    ['With sources', String(validation.provenance.sources)],
    ['Generated', String(validation.generation.generated)],
    ['Human reviewed', String(validation.trust.humanReviewed)],
    ['Machine confirmed', String(validation.trust.machineConfirmed)],
    ['Unverified', String(validation.trust.unverified)],
    ['Draft', String(validation.lifecycle.draft)],
    ['Stable', String(validation.lifecycle.stable)],
    ['Deprecated', String(validation.lifecycle.deprecated)],
    ['Fresh', String(validation.freshness.fresh)],
    ['Stale', String(validation.freshness.stale)],
    ['Freshness unspecified', String(validation.freshness.unspecified)],
    ['Attested computations', String(validation.attestation.concepts)],
    [
      'Complete attestation contracts',
      String(validation.attestation.completeContracts),
    ],
    [
      'Incomplete attestation contracts',
      String(validation.attestation.incompleteContracts),
    ],
    ['Inline computations', String(validation.attestation.inlineComputations)],
    ['File computations', String(validation.attestation.fileComputations)],
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
  if (validation.issuesTruncated) {
    process.stdout.write(
      `\n${validation.omittedIssues} more validation issues were omitted.\n`,
    )
  }
}

function validationProfile(value: unknown): OkfValidationProfile {
  const profile = stringArg(value) ?? 'okf'
  if (profile === 'okf' || profile === 'seo-export') return profile
  throw new SeoError('INVALID_INPUT', 'Profile must be okf or seo-export.')
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
      description: 'Maximum page concepts to export. Defaults to 500.',
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
      ['Page concepts', String(bundle.pageConceptCount)],
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
    profile: {
      type: 'string',
      description: 'Validation profile: okf or seo-export. Defaults to okf.',
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
    const validation = validateOkfFiles(files, {
      profile: validationProfile(args.profile),
    })
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
    profile: {
      type: 'string',
      description: 'Validation profile: okf or seo-export. Defaults to okf.',
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
    const validation = validateOkfFiles(await readOkfMarkdownFiles(path), {
      profile: validationProfile(args.profile),
    })
    const explanation = explainOkfValidation(validation)
    if (!explanation.valid) process.exitCode = 1
    if (jsonFlag(args)) {
      printJson(explanation)
      return
    }
    process.stdout.write(`${explanation.summary}\n\n`)
    printKeyValue([
      ['Version', explanation.formatVersion ?? 'not declared'],
      ['Compatibility', explanation.compatibility],
      ['Profile', explanation.profile],
      ['Valid', explanation.valid ? 'yes' : 'no'],
      ['Files', String(explanation.files)],
      ['Concepts', String(explanation.concepts)],
      ['Errors', String(explanation.errors)],
      ['Warnings', String(explanation.warnings)],
      ['With sources', String(explanation.provenance.sources)],
      ['Generated', String(explanation.generation.generated)],
      ['Human reviewed', String(explanation.trust.humanReviewed)],
      ['Machine confirmed', String(explanation.trust.machineConfirmed)],
      ['Unverified', String(explanation.trust.unverified)],
      ['Draft', String(explanation.lifecycle.draft)],
      ['Stable', String(explanation.lifecycle.stable)],
      ['Deprecated', String(explanation.lifecycle.deprecated)],
      ['Fresh', String(explanation.freshness.fresh)],
      ['Stale', String(explanation.freshness.stale)],
      ['Freshness unspecified', String(explanation.freshness.unspecified)],
      ['Attested computations', String(explanation.attestation.concepts)],
      [
        'Complete attestation contracts',
        String(explanation.attestation.completeContracts),
      ],
      [
        'Incomplete attestation contracts',
        String(explanation.attestation.incompleteContracts),
      ],
      [
        'Inline computations',
        String(explanation.attestation.inlineComputations),
      ],
      ['File computations', String(explanation.attestation.fileComputations)],
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
