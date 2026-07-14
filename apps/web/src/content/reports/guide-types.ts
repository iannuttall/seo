import type { ReportEditorial, ReportSourceKey } from './types'

export type ReportGuideInput = {
  label: string
  role?: string
  source?: ReportSourceKey
}

export type ReportGuideAlternative = {
  when: string
  doInstead: string
  reportId?: string
  href?: string
  label?: string
}

export type ReportGuideSeo = {
  title: string
  description: string
  heading: string
  primaryKeyword?: string
  supportingKeywords?: readonly string[]
}

export type ReportGuideKeywords = Pick<
  ReportGuideSeo,
  'primaryKeyword' | 'supportingKeywords'
>

export type ReportGuideOverride = {
  name?: string
  summary?: string
  inputs?: readonly [ReportGuideInput, ...ReportGuideInput[]]
  checks?: readonly [string, ...string[]]
  returns?: readonly [string, ...string[]]
  alternatives?: readonly [ReportGuideAlternative, ...ReportGuideAlternative[]]
  seo?: ReportGuideKeywords
}

export type ResolvedReportGuide = Omit<ReportEditorial, 'name' | 'summary'> & {
  name: string
  summary: string
  lead: string
  inputs: readonly [ReportGuideInput, ...ReportGuideInput[]]
  checks: readonly [string, ...string[]]
  returns: readonly [string, ...string[]]
  alternatives: readonly [ReportGuideAlternative, ...ReportGuideAlternative[]]
  seo?: ReportGuideSeo
}
