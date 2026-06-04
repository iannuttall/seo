import type { PriorityQueueItem, WorkflowReport } from './types.js'

type Scalar = boolean | number | string | null
type Row = Record<string, Scalar>
type RecordValue = Record<string, unknown>

export type WorkflowTableColumn = {
  key: string
  label: string
  type?: 'number' | 'string' | 'url'
}

export type WorkflowTable = {
  id: string
  title: string
  columns: WorkflowTableColumn[]
  rows: Row[]
}

export type WorkflowChart = {
  id: string
  title: string
  type: 'bar'
  tableId: string
  xKey: string
  yKey: string
}

export type WorkflowPresentation = {
  tables: WorkflowTable[]
  charts: WorkflowChart[]
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null
}

function priorityQueue(output: unknown): PriorityQueueItem[] {
  if (!isRecord(output)) return []
  const queue = output.queue
  if (!Array.isArray(queue)) return []
  return queue.filter((item): item is PriorityQueueItem => isRecord(item))
}

function stepsTable(
  report: WorkflowReport<unknown>,
): WorkflowTable | undefined {
  if (!report.steps.length) return undefined
  return {
    id: 'steps',
    title: 'Steps',
    columns: [
      { key: 'tool', label: 'Tool' },
      { key: 'status', label: 'Status' },
      { key: 'summary', label: 'Summary' },
    ],
    rows: report.steps.map((step) => ({
      tool: step.tool,
      status: step.status,
      summary: step.summary,
    })),
  }
}

function actionsTable(
  report: WorkflowReport<unknown>,
): WorkflowTable | undefined {
  if (!report.actions.length) return undefined
  return {
    id: 'recommended_actions',
    title: 'Recommended Actions',
    columns: [
      { key: 'priority', label: 'Priority', type: 'number' },
      { key: 'title', label: 'Title' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'action', label: 'Action' },
    ],
    rows: report.actions.map((action, index) => ({
      priority: index + 1,
      title: action.title,
      confidence: action.confidence,
      action: action.action,
    })),
  }
}

function queueTable(
  queue: PriorityQueueItem[],
  limit: number,
): WorkflowTable | undefined {
  if (!queue.length) return undefined
  return {
    id: 'priority_queue',
    title: 'Priority Queue',
    columns: [
      { key: 'rank', label: 'Rank', type: 'number' },
      { key: 'source', label: 'Source' },
      { key: 'category', label: 'Category' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'target', label: 'Target', type: 'url' },
      { key: 'action', label: 'Action' },
    ],
    rows: queue.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      source: item.source,
      category: item.category,
      score: Number(item.score.toFixed(1)),
      confidence: item.confidence,
      target: item.target,
      action: item.action,
    })),
  }
}

export function workflowPresentation(
  report: WorkflowReport<unknown>,
  options: { queueLimit?: number } = {},
): WorkflowPresentation {
  const queue = priorityQueue(report.output)
  const tables = [
    stepsTable(report),
    actionsTable(report),
    queueTable(queue, options.queueLimit ?? 10),
  ].filter((table): table is WorkflowTable => Boolean(table))
  const charts: WorkflowChart[] = queue.length
    ? [
        {
          id: 'priority_scores',
          title: 'Priority Scores',
          type: 'bar',
          tableId: 'priority_queue',
          xKey: 'rank',
          yKey: 'score',
        },
      ]
    : []
  return { tables, charts }
}
