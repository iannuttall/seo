import type { ReportCategory, ReportEditorial } from './types'

export const categoryLabels: Record<ReportCategory, string> = {
  'ai-search': 'AI search evidence',
  crawl: 'Crawling and technical checks',
  diagnosis: 'Property diagnosis',
  experiments: 'Change measurement',
  monitoring: 'Technical monitoring',
  opportunities: 'Search opportunities',
  reporting: 'Reporting',
  setup: 'Setup',
  workflows: 'Multi-report workflows',
}

export function reportCommand(report: ReportEditorial): string {
  return `seo reports run ${report.id} --params '${JSON.stringify(report.exampleParams)}' --json`
}

export function describeCommand(report: ReportEditorial): string {
  return `seo reports describe ${report.id} --json`
}

export function reportPath(id: string): string {
  return `/docs/reports/${id}`
}

export function reportMetaDescription(report: ReportEditorial): string {
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

export function reportPageTitle(report: ReportEditorial): string {
  const candidates = [
    `${report.name}: SEO report evidence and local CLI guide | SEO Skills CLI`,
    `${report.name}: SEO report and local CLI guide | SEO Skills CLI`,
    `${report.name}: local CLI report guide | SEO Skills CLI`,
    `${report.name} report guide | SEO Skills CLI`,
  ]
  return (
    candidates.find((title) => title.length >= 55 && title.length <= 70) ??
    candidates.at(-1) ??
    report.name
  )
}
