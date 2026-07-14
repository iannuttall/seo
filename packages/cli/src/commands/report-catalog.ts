import { readFile } from 'node:fs/promises'
import { SeoError, type SeoErrorCode } from '@seo/core'
import {
  describeReport,
  executeReport,
  listReports,
  REPORT_CATEGORIES,
  type ReportCategory,
} from '@seo/mcp'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import {
  printBulletSection,
  printCallout,
  printCatalog,
  printHeading,
  printJson,
  printKeyValue,
  printParameters,
  printSection,
} from '../utils.js'

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  'ai-search': 'AI search',
  crawl: 'Crawling and technical checks',
  diagnosis: 'Diagnosis',
  experiments: 'Experiments',
  monitoring: 'Monitoring',
  opportunities: 'Opportunities',
  reporting: 'Reporting',
  setup: 'Setup',
  workflows: 'Workflows',
}

function categoryArg(value: unknown): ReportCategory | undefined {
  const category = stringArg(value)
  if (!category) return undefined
  if (!REPORT_CATEGORIES.includes(category as ReportCategory)) {
    throw new SeoError(
      'INVALID_INPUT',
      `Unknown report category: ${category}. Choose ${REPORT_CATEGORIES.join(', ')}.`,
    )
  }
  return category as ReportCategory
}

async function paramsArg(
  inlineValue: unknown,
  fileValue: unknown,
): Promise<Record<string, unknown>> {
  const inline = stringArg(inlineValue)
  const file = stringArg(fileValue)
  if (inline && file) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use either --params or --params-file, not both.',
    )
  }
  if (!inline && !file) return {}

  const source = inline ?? (await readFile(file ?? '', 'utf8'))
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new SeoError('INVALID_INPUT', 'Report parameters must be valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SeoError('INVALID_INPUT', 'Report parameters must be an object.')
  }
  return parsed as Record<string, unknown>
}

function throwToolError(result: {
  isError?: boolean
  structuredContent?: Record<string, unknown>
}): void {
  if (!result.isError) return
  const envelope = result.structuredContent as
    | { error?: { code?: SeoErrorCode; message?: string } }
    | undefined
  throw new SeoError(
    envelope?.error?.code ?? 'INTERNAL_ERROR',
    envelope?.error?.message ?? 'The report could not be completed.',
  )
}

type JsonSchemaProperty = {
  description?: string
  format?: string
  items?: { type?: string }
  type?: string | string[]
}

function reportParameters(inputSchema: unknown) {
  if (!inputSchema || typeof inputSchema !== 'object') return []
  const schema = inputSchema as {
    properties?: Record<string, JsonSchemaProperty>
    required?: string[]
  }
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).map(([name, property]) => {
    const rawType = Array.isArray(property.type)
      ? property.type.join(' | ')
      : (property.type ?? 'any')
    const type =
      rawType === 'array' && property.items?.type
        ? `${property.items.type}[]`
        : property.format
          ? `${rawType} (${property.format})`
          : rawType
    return {
      name,
      type,
      required: required.has(name),
      description: property.description,
    }
  })
}

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List report ids available to the CLI and MCP server',
  },
  args: {
    category: {
      type: 'string',
      description: `Filter by category: ${REPORT_CATEGORIES.join(', ')}.`,
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const category = categoryArg(args.category)
    const reports = listReports(category)
    if (jsonFlag(args)) {
      printJson({ reports, categories: REPORT_CATEGORIES })
      return
    }
    printCatalog(reports, {
      noun: 'report',
      categoryLabels: CATEGORY_LABELS,
    })
    process.stdout.write('\n')
    printCallout({
      title: 'Need the detail?',
      body: 'Describe one report to see when to use it, what it needs, and what the result can prove.',
      command: 'seo reports describe <id>',
    })
  },
})

const describeCommand = defineCommand({
  meta: {
    name: 'describe',
    description: 'Show the purpose and parameter schema for one report',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Report id from `seo reports list`.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const report = describeReport(stringArg(args.id) ?? '')
    if (jsonFlag(args)) {
      printJson({ report })
      return
    }
    printHeading(report.name, report.description)
    process.stdout.write('\n')
    printKeyValue([
      ['ID', report.id],
      ['Category', report.category],
      ['Outcome', report.outcome],
    ])
    process.stdout.write('\n')
    printBulletSection('Use when', report.useWhen)
    process.stdout.write('\n')
    printBulletSection('Avoid when', report.avoidWhen)
    process.stdout.write('\n')
    printBulletSection('Read in order', report.readOrder)
    process.stdout.write('\n')
    printBulletSection('Do not claim', report.doNotClaim)
    process.stdout.write('\n')
    printSection('Verify', report.verify)
    if (report.related.length > 0) {
      process.stdout.write('\n')
      printBulletSection(
        'Related reports',
        report.related.map((item) => `${item.id}: ${item.reason}`),
      )
    }
    process.stdout.write('\nParameters\n')
    printParameters(reportParameters(report.inputSchema))
    process.stdout.write('\n')
    printCallout({
      title: 'Need the exact schema?',
      command: `seo reports describe ${report.id} --json`,
    })
  },
})

const runCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'Run one report with JSON parameters',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Report id from `seo reports list`.',
    },
    params: {
      type: 'string',
      description: 'Report parameters as a JSON object.',
    },
    'params-file': {
      type: 'string',
      description: 'Read report parameters from a JSON file.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const params = await paramsArg(args.params, args['params-file'])
    const result = await executeReport(id, params)
    throwToolError(result)

    if (jsonFlag(args)) {
      printJson(result.structuredContent ?? {})
      return
    }
    for (const item of result.content) {
      process.stdout.write(`${item.text}\n`)
    }
  },
})

export const reportCatalogCommand = defineCommand({
  meta: {
    name: 'reports',
    description: 'Discover and run the complete report catalog',
  },
  subCommands: {
    list: listCommand,
    describe: describeCommand,
    run: runCommand,
  },
})
