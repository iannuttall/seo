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
    | 'template'
    | 'crawl'
  title: string
  target: string
  category: 'technical' | 'content' | 'serp' | 'authority' | 'strategy'
  score: number
  impact: number
  impactKind?:
    | 'observed_retained_query_clicks'
    | 'heuristic_ctr_click_shortfall'
    | 'heuristic_priority_score'
    | 'heuristic_multi_url_exposure'
    | 'ordinal'
  confidence: 'high' | 'medium' | 'low'
  template?: {
    id: string
    label: string
    count: number
  }
  analytics?: {
    sessions: number
    totalUsers: number
  }
  grouped?: {
    count: number
    totalImpact: number
    totalScore: number
    findings: Array<{
      source: PriorityQueueItem['source']
      title: string
      target: string
      category: PriorityQueueItem['category']
      score: number
      impact: number
      impactKind?: PriorityQueueItem['impactKind']
      confidence: PriorityQueueItem['confidence']
      template?: PriorityQueueItem['template']
      analytics?: PriorityQueueItem['analytics']
      action: string
      evidence: string
    }>
  }
  scoreBreakdown: {
    impact: number
    source: number
    confidence: number
    effort: number
    verification: number
    template: number
    analytics: number
    final: number
  }
  action: string
  evidence: string
}
