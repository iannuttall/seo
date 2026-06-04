import type { PriorityQueueItem, WorkflowReport } from './types.js'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null
}

function tableCell(value: unknown): string {
  return String(value ?? '-')
    .replaceAll('\n', ' ')
    .replaceAll('|', '\\|')
}

function truncate(value: unknown, maxLength = 120): string {
  const text = tableCell(value).trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}...`
}

function priorityQueue(output: unknown): PriorityQueueItem[] {
  if (!isRecord(output)) return []
  const queue = output.queue
  if (!Array.isArray(queue)) return []
  return queue.filter((item): item is PriorityQueueItem => isRecord(item))
}

function renderSteps(report: WorkflowReport<unknown>): string[] {
  if (!report.steps.length) return []
  return [
    '## Steps',
    '',
    '| Tool | Status | Summary |',
    '| --- | --- | --- |',
    ...report.steps.map(
      (step) =>
        `| ${tableCell(step.tool)} | ${tableCell(step.status)} | ${truncate(step.summary)} |`,
    ),
    '',
  ]
}

function renderActions(report: WorkflowReport<unknown>): string[] {
  if (!report.actions.length) return []
  return [
    '## Recommended Actions',
    '',
    '| Priority | Confidence | Action |',
    '| --- | --- | --- |',
    ...report.actions.map(
      (action, index) =>
        `| ${index + 1}. ${truncate(action.title, 60)} | ${tableCell(action.confidence)} | ${truncate(action.action)} |`,
    ),
    '',
  ]
}

function renderQueue(queue: PriorityQueueItem[], limit: number): string[] {
  if (!queue.length) return []
  const rows = queue.slice(0, limit)
  return [
    '## Priority Queue',
    '',
    '| Rank | Source | Category | Score | Confidence | Target | Action |',
    '| --- | --- | --- | ---: | --- | --- | --- |',
    ...rows.map(
      (item, index) =>
        `| ${index + 1} | ${tableCell(item.source)} | ${tableCell(item.category)} | ${item.score.toFixed(1)} | ${tableCell(item.confidence)} | ${truncate(item.target, 70)} | ${truncate(item.action)} |`,
    ),
    '',
  ]
}

export function renderWorkflowMarkdown(
  report: WorkflowReport<unknown>,
  options: { queueLimit?: number } = {},
): string {
  const queueLimit = options.queueLimit ?? 10
  const lines = [
    `# ${report.workflow}`,
    '',
    `Property: ${report.site}`,
    `Generated: ${report.generatedAt}`,
    '',
    report.summary,
    '',
    ...renderSteps(report),
    ...renderActions(report),
    ...renderQueue(priorityQueue(report.output), queueLimit),
  ]
  return lines.join('\n').trim()
}
