import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { registerAiOpportunityTools } from './ai-opportunity-tools.js'
import { registerCrawlerTools } from './crawler-tools.js'
import { registerDiagnosisTools } from './diagnosis-tools.js'
import { registerExperimentTools } from './experiment-tools.js'
import { registerMonitoringTools } from './monitoring-tools.js'
import { registerOpportunityTools } from './opportunity-tools.js'
import { registerPseoTools } from './pseo-tools.js'
import {
  getReportGuidance,
  REPORT_GUIDANCE,
  type RelatedReport,
} from './report-guidance.js'
import { registerReportTools } from './report-tools.js'
import type { ToolResult } from './tool-result.js'
import { registerWorkflowTools } from './workflow-tools.js'

export const REPORT_CATEGORIES = [
  'ai-search',
  'crawl',
  'diagnosis',
  'experiments',
  'monitoring',
  'opportunities',
  'reporting',
  'setup',
  'workflows',
] as const

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]

type ReportHandler = (
  input: Record<string, unknown>,
) => ToolResult | Promise<ToolResult>

type CapturedTool = {
  inputSchema?: z.ZodRawShape | z.ZodObject<z.ZodRawShape>
  handler: ReportHandler
}

type ReportGroup = {
  category: ReportCategory
  names: readonly string[]
  register: (server: McpServer) => void
}

const reportGroups: readonly ReportGroup[] = [
  {
    category: 'setup',
    register: registerDiagnosisTools,
    names: ['seo_doctor'],
  },
  {
    category: 'diagnosis',
    register: registerDiagnosisTools,
    names: [
      'seo_segment_impact',
      'seo_striking_distance',
      'seo_traffic_anomaly',
      'seo_update_correlate',
    ],
  },
  {
    category: 'opportunities',
    register: registerOpportunityTools,
    names: [
      'seo_cannibal',
      'seo_ctr_underperformers',
      'seo_decaying',
      'seo_internal_links',
      'seo_query_cluster',
      'seo_quick_wins',
    ],
  },
  {
    category: 'ai-search',
    register: registerAiOpportunityTools,
    names: [
      'seo_ai_referrals',
      'seo_community_intent',
      'seo_content_optimization',
      'seo_page_opportunities',
      'seo_performance_audit',
      'seo_to_ai_query',
    ],
  },
  {
    category: 'ai-search',
    register: registerCrawlerTools,
    names: ['seo_ai_search_scorecard'],
  },
  {
    category: 'crawl',
    register: registerCrawlerTools,
    names: [
      'seo_affected_urls',
      'seo_ai_readiness',
      'seo_audit_urls',
      'seo_compare_crawl_reports',
      'seo_crawl_site',
      'seo_entity_readiness',
      'seo_explain_issue',
      'seo_geo_gaps',
      'seo_get_crawl_report',
      'seo_list_crawl_reports',
      'seo_list_rules',
      'seo_llms_txt_audit',
      'seo_llms_txt_generate',
      'seo_okf_build',
      'seo_okf_validate',
      'seo_top_fixes',
    ],
  },
  {
    category: 'monitoring',
    register: registerMonitoringTools,
    names: [
      'seo_crawl_diff',
      'seo_index_coverage',
      'seo_index_coverage_plan',
      'seo_index_monitor',
      'seo_index_watch',
      'seo_link_recover',
      'seo_redirect_trace',
    ],
  },
  {
    category: 'reporting',
    register: registerReportTools,
    names: [
      'seo_audit_page',
      'seo_monthly_report',
      'seo_report_narrative',
      'seo_second_page',
    ],
  },
  {
    category: 'experiments',
    register: registerExperimentTools,
    names: ['seo_measure_change'],
  },
  {
    category: 'reporting',
    register: registerPseoTools,
    names: ['seo_pseo_audit'],
  },
  {
    category: 'workflows',
    register: registerWorkflowTools,
    names: [
      'seo_workflow_diagnose_property',
      'seo_workflow_monthly_report',
      'seo_workflow_refresh_priorities',
      'seo_workflow_technical_watch',
      'seo_workflow_update_postmortem',
    ],
  },
] as const

export type ReportSummary = {
  id: string
  category: ReportCategory
  name: string
  description: string
}

export type ReportDefinition = ReportSummary & {
  useWhen: readonly string[]
  avoidWhen: readonly string[]
  outcome: string
  readOrder: readonly string[]
  doNotClaim: readonly string[]
  verify: string
  related: readonly RelatedReport[]
  inputSchema: z.ZodObject<z.ZodRawShape>
  handler: ReportHandler
}

const REPORT_ID_OVERRIDES = {
  cannibal: 'cannibalisation',
  decaying: 'decaying-pages',
  'crawl-site': 'site-crawl',
  'link-recover': 'link-recovery',
  'llms-txt-generate': 'generate-llms-txt',
  'query-cluster': 'query-clusters',
  'report-narrative': 'narrative-report',
  'to-ai-query': 'seo-to-ai-query',
  'workflow-refresh-priorities': 'refresh-priorities',
  'workflow-technical-watch': 'technical-watch',
  'workflow-update-postmortem': 'update-postmortem',
  'workflow-diagnose-property': 'search-performance-overview',
  'workflow-monthly-report': 'monthly-action-plan',
  doctor: 'setup-check',
  'update-correlate': 'update-correlation',
  'compare-crawl-reports': 'compare-crawls',
  'list-crawl-reports': 'crawl-history',
  'list-rules': 'crawler-rules',
  'get-crawl-report': 'crawl-report',
  'explain-issue': 'explain-crawl-issue',
} as const satisfies Record<string, string>

function reportId(toolName: string): string {
  const internalId = toolName.replace(/^seo_/, '').replaceAll('_', '-')
  return (
    REPORT_ID_OVERRIDES[internalId as keyof typeof REPORT_ID_OVERRIDES] ??
    internalId
  )
}

function compareIds(a: ReportSummary, b: ReportSummary): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function captureTools(register: (server: McpServer) => void) {
  const tools = new Map<string, CapturedTool>()
  register({
    registerTool(
      name: string,
      config: {
        description?: string
        inputSchema?: z.ZodRawShape | z.ZodObject<z.ZodRawShape>
      },
      handler: ReportHandler,
    ) {
      tools.set(name, { inputSchema: config.inputSchema, handler })
    },
  } as never)
  return tools
}

function normalizeInputSchema(
  inputSchema?: z.ZodRawShape | z.ZodObject<z.ZodRawShape>,
): z.ZodObject<z.ZodRawShape> {
  return inputSchema instanceof z.ZodObject
    ? inputSchema
    : z.strictObject(inputSchema ?? {})
}

function createDefinitions(): ReportDefinition[] {
  const capturedByRegister = new Map<
    ReportGroup['register'],
    Map<string, CapturedTool>
  >()
  const definitions: ReportDefinition[] = []

  for (const group of reportGroups) {
    let captured = capturedByRegister.get(group.register)
    if (!captured) {
      captured = captureTools(group.register)
      capturedByRegister.set(group.register, captured)
    }

    for (const name of group.names) {
      const tool = captured.get(name)
      if (!tool) {
        throw new Error(`MCP report registry references missing tool ${name}.`)
      }
      const id = reportId(name)
      const guidance = getReportGuidance(id)
      if (!guidance) {
        throw new Error(`MCP report registry is missing guidance for ${id}.`)
      }
      definitions.push({
        id,
        category: group.category,
        ...guidance,
        inputSchema: normalizeInputSchema(tool.inputSchema),
        handler: tool.handler,
      })
    }
  }

  return definitions.sort(compareIds)
}

const definitions = createDefinitions()
const definitionIds = new Set(definitions.map((report) => report.id))
const extraGuidanceIds = Object.keys(REPORT_GUIDANCE).filter(
  (id) => !definitionIds.has(id),
)
if (extraGuidanceIds.length > 0) {
  throw new Error(
    `MCP report guidance references unknown reports: ${extraGuidanceIds.join(', ')}.`,
  )
}
const definitionsById = new Map(
  definitions.map((report) => [report.id, report]),
)

export function listReportDefinitions(
  category?: ReportCategory,
): ReportSummary[] {
  return definitions
    .filter((report) => !category || report.category === category)
    .map(({ id, name, description, category: reportCategory }) => ({
      id,
      category: reportCategory,
      name,
      description,
    }))
}

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return definitionsById.get(id)
}
