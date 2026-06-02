export type WorkflowStep = {
  tool: string
  status: 'completed' | 'skipped'
  summary: string
}

export type WorkflowAction = {
  title: string
  action: string
  confidence: 'high' | 'medium' | 'low'
}

export type WorkflowReport<TOutput> = {
  workflow: string
  site: string
  generatedAt: string
  summary: string
  steps: WorkflowStep[]
  actions: WorkflowAction[]
  output: TOutput
}

export type PriorityQueueItem = {
  source:
    | 'decay'
    | 'striking-distance'
    | 'quick-win'
    | 'cannibalization'
    | 'diagnosis'
  title: string
  target: string
  score: number
  confidence: 'high' | 'medium' | 'low'
  action: string
  evidence: string
}
