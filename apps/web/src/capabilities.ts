export type Capability = {
  id: string
  label: string
  status: 'ready' | 'next'
  detail: string
}

export const capabilities: Capability[] = [
  {
    id: 'gsc',
    label: 'Google Search Console',
    status: 'ready',
    detail: 'Properties, Search Analytics, URL Inspection, and cached history.',
  },
  {
    id: 'ga4',
    label: 'Google Analytics 4',
    status: 'ready',
    detail: 'GA4 Data API report runs for landing-page and event-level joins.',
  },
  {
    id: 'updates',
    label: 'Search Updates',
    status: 'ready',
    detail:
      'Official Google Search Status incidents and ranking update windows.',
  },
  {
    id: 'mcp',
    label: 'Remote MCP',
    status: 'next',
    detail:
      'Authenticated HTTP MCP endpoint backed by stored workspace credentials.',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    status: 'next',
    detail:
      'Scheduled crawl diffs, index watches, change logs, and alert thresholds.',
  },
]
