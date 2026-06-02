import type { WorkflowAction, WorkflowReport, WorkflowStep } from './types.js'

export function workflowReport<TOutput>(input: {
  workflow: string
  site: string
  summary: string
  steps: WorkflowStep[]
  actions: WorkflowAction[]
  output: TOutput
}): WorkflowReport<TOutput> {
  return {
    workflow: input.workflow,
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: input.summary,
    steps: input.steps,
    actions: input.actions,
    output: input.output,
  }
}
