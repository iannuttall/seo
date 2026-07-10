import type { ReportEditorial, ReportSourceKey } from './types'

export type ReportGuideInput = {
  label: string
  role?: string
  source?: ReportSourceKey
}

export type ReportGuideSeo = {
  title: string
  description: string
  heading: string
}

export type ReportGuideOverride = {
  name?: string
  summary?: string
  lead?: string
  inputs?: readonly [ReportGuideInput, ...ReportGuideInput[]]
  checks?: readonly [string, ...string[]]
  returns?: readonly [string, ...string[]]
  seo?: ReportGuideSeo
}

export type ResolvedReportGuide = Omit<ReportEditorial, 'name' | 'summary'> & {
  name: string
  summary: string
  lead: string
  inputs: readonly [ReportGuideInput, ...ReportGuideInput[]]
  checks: readonly [string, ...string[]]
  returns: readonly [string, ...string[]]
  seo?: ReportGuideSeo
}
