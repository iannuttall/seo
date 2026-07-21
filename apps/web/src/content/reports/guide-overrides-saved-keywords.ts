import type { ReportGuideOverride } from './guide-types'

export const savedKeywordGuideOverrides: Partial<
  Record<string, ReportGuideOverride>
> = {
  'saved-keywords': {
    name: 'Review saved keyword research',
    summary:
      'Open one local project keyword set and check metric freshness, research tags, page mappings, and view coverage before choosing the next investigation.',
    inputs: [
      {
        label: 'Local project keyword set',
        role: 'Provides the saved market, research source, terms, user-managed tags, and existing or proposed page mappings.',
      },
      {
        label: 'Saved provider metric snapshots',
        source: 'keyword-provider-metrics',
        role: 'Adds the latest typed estimate and observation date for each returned term when it has been refreshed.',
      },
    ],
    checks: [
      'Keeps total, matched, and returned rows separate when a tag filter or pagination limits the view.',
      'Counts missing, observed-zero, and stale metric snapshots separately instead of filling gaps with zero.',
      'Groups tags and page mappings for review without treating either as proof of shared intent, rankings, indexing, or content need.',
    ],
    returns: [
      'A limited local keyword view with market, source, pagination, filters, metric states, tags, page mappings, and refresh dates.',
      'Evidence-linked findings for missing metrics, stale metrics, and unmapped terms with clear verification steps.',
    ],
    alternatives: [
      {
        when: 'You need new market candidates rather than terms already saved in the project.',
        reportId: 'keyword-research',
        doInstead:
          'Run keyword research from a small seed list. It performs bounded provider discovery and keeps acquisition coverage and cost beside the returned candidates.',
      },
      {
        when: 'You need first-party evidence for which terms already surface your pages.',
        reportId: 'keyword-opportunities',
        doInstead:
          'Run keyword opportunities for the Search Console property. It starts from returned query and page evidence, then adds independent estimates only when explicitly requested.',
      },
    ],
    seo: {
      primaryKeyword: 'keyword list management',
      supportingKeywords: ['keyword research workflow'],
    },
  },
}
