import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  type ReportHtmlSection,
  type ReportHtmlView,
  type ReportNarrative,
  renderReportHtml,
  SeoError,
} from '@seo/core'
import { booleanArg, stringArg } from '../args.js'

export const reportHtmlArgs = {
  format: {
    type: 'string',
    description: 'Output format: terminal or html. Defaults to terminal.',
  },
  output: {
    type: 'string',
    description: 'HTML output file. A dated filename is used by default.',
  },
  view: {
    type: 'string',
    description: 'HTML detail level: client or analyst. Defaults to client.',
  },
} as const

export type ReportHtmlOptions = {
  output?: string
  view: ReportHtmlView
}

export function reportHtmlOptions(
  args: Record<string, unknown>,
): ReportHtmlOptions | undefined {
  const format = stringArg(args.format) ?? 'terminal'
  if (format !== 'terminal' && format !== 'html') {
    throw new SeoError('INVALID_INPUT', 'Choose terminal or html for --format.')
  }
  if (format === 'terminal') {
    if (stringArg(args.output) || stringArg(args.view)) {
      throw new SeoError(
        'INVALID_INPUT',
        'Use --output and --view with --format html.',
      )
    }
    return undefined
  }
  if (booleanArg(args.json)) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use either --json or --format html, not both.',
    )
  }

  const view = stringArg(args.view) ?? 'client'
  if (view !== 'client' && view !== 'analyst') {
    throw new SeoError('INVALID_INPUT', 'Choose client or analyst for --view.')
  }
  return { output: stringArg(args.output), view }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function defaultReportHtmlPath(input: {
  reportName: string
  projectId?: string
  site: string
  date?: Date
}): string {
  const day = (input.date ?? new Date()).toISOString().slice(0, 10)
  const identity = slug(input.projectId ?? input.site) || 'site'
  return resolve(
    process.cwd(),
    `${identity}-${slug(input.reportName)}-${day}.html`,
  )
}

export async function writeReportHtml(input: {
  report: ReportNarrative
  reportName: string
  title: string
  options: ReportHtmlOptions
  projectId?: string
  additionalSections?: ReportHtmlSection[]
}): Promise<string> {
  const path = resolve(
    input.options.output ??
      defaultReportHtmlPath({
        reportName: input.reportName,
        projectId: input.projectId,
        site: input.report.site,
      }),
  )
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    renderReportHtml({
      report: input.report,
      title: input.title,
      view: input.options.view,
      additionalSections: input.additionalSections,
    }),
    'utf8',
  )
  return path
}

export function printReportHtmlPath(path: string): void {
  process.stdout.write(`Wrote HTML report to ${path}\n`)
}
