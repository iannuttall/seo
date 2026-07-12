import { reportCategoryById } from './categories'
import type { ReportGuideSeo } from './guides'
import { reportSlugs } from './manifest.mjs'
import type { ReportCategory, ReportEditorial } from './types'

export const categoryLabels = Object.fromEntries(
  [...reportCategoryById].map(([id, category]) => [id, category.label]),
) as Record<ReportCategory, string>

export function reportCommand(report: ReportEditorial): string {
  return `seo reports run ${report.id} --params '${JSON.stringify(report.exampleParams)}' --json`
}

export function describeCommand(report: ReportEditorial): string {
  return `seo reports describe ${report.id} --json`
}

export function reportPath(id: string): string {
  const slug = reportSlugs[id as keyof typeof reportSlugs] ?? id
  return `/docs/reports/${slug}`
}

export function reportMetaDescription(
  report: ReportEditorial,
  seo?: ReportGuideSeo,
): string {
  if (seo) return seo.description

  const suffixes = [
    ' See when to use it, how to read the evidence, and the exact local CLI command.',
    ' See when to use it, read the evidence, and run the exact local CLI command.',
    ' See the evidence, limits, next steps, and exact local CLI command.',
    ' See the limits, next steps, and exact local CLI command.',
    ' Includes evidence, limits, and the exact local CLI command.',
    ' Includes the limits and exact local CLI command.',
    ' Includes the exact local CLI command.',
    ' Run it with the local CLI.',
    ' Runs locally.',
  ]
  const candidates = suffixes.map((suffix) => `${report.summary}${suffix}`)
  return (
    candidates.find(
      (description) => description.length >= 140 && description.length <= 160,
    ) ??
    candidates.find((description) => description.length <= 160) ??
    report.summary
  )
}

export function reportPageTitle(
  report: ReportEditorial,
  seo?: ReportGuideSeo,
  displayName = report.name,
): string {
  if (seo) return seo.title

  const candidates = [
    `${displayName}: SEO report evidence and local CLI guide | seo`,
    `${displayName}: SEO report and local CLI guide | seo`,
    `${displayName}: local CLI report guide | seo`,
    `${displayName} report guide | seo`,
  ]
  return (
    candidates.find((title) => title.length >= 55 && title.length <= 70) ??
    candidates.at(-1) ??
    displayName
  )
}
