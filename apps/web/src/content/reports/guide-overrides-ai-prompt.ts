import type { ReportGuideOverride } from './guide-types'

export const aiPromptGuideOverrides: Partial<
  Record<string, ReportGuideOverride>
> = {
  'ai-prompt-observations': {
    name: 'Record fixed AI prompt observations',
    summary:
      'Run a small fixed set of prompts against explicit current AI models, retain the evidence locally, and compare only like-for-like observations.',
    inputs: [
      {
        label: 'Fixed prompts and exact model names',
        role: 'Defines up to five prompts and four current ChatGPT, Claude, Gemini, or Perplexity models. The free model catalog is checked before paid work.',
      },
      {
        label: 'Named target and competitors',
        role: 'Supplies aliases and domains used to find answer mentions and citations without relying on provider-specific target fields.',
      },
      {
        label: 'Optional Search Console query rows',
        source: 'search-analytics',
        role: 'Adds bounded first-party query and landing-page context for a property you own.',
      },
      {
        label: 'Live AI response evidence',
        source: 'ai-prompt-provider',
        role: 'Provides answer text, citations, extra supporting searches returned as fan-out queries, the model the provider actually ran, token use, task id, cache state, and exact returned cost.',
      },
    ],
    checks: [
      'Rejects unknown models, unsupported web search, more than 20 prompt and model combinations, and invalid output-token limits before paid acquisition.',
      'Caps live work at 20 requests and concurrency at four, then bounds retained answers, citations, fan-out queries, first-party matching work, local history, and agent output.',
      'Keeps base-fee estimates separate from exact returned task cost and keeps unavailable observations visible instead of converting them to zeros.',
      'Compares only fresh, complete, untruncated observations with the same provider, prompt, requested and effective model, market label, web-search setting, and output-token limit.',
    ],
    returns: [
      'One evidence envelope per observation with the answer, citations, supporting searches, model, token use, task id, cache state, coverage, checked time, and cost.',
      'Named-target matches, cited-domain summaries, like-for-like change evidence, repeated supporting-search themes, optional Search Console overlap, findings, warnings, caveats, and next steps.',
    ],
    alternatives: [
      {
        when: 'You want broader provider-indexed mention counts, cited domains, or related question samples for one market.',
        reportId: 'ai-mention-research',
        doInstead:
          'Run AI mention research. It queries a bounded indexed dataset instead of generating a fresh answer for every supplied prompt and model.',
      },
      {
        when: 'You need a prompt set grounded in searches already associated with the site.',
        reportId: 'seo-to-ai-query',
        doInstead:
          'Build a stable prompt seed set from retained Search Console queries first, then choose a small decision-critical subset for live observation.',
      },
      {
        when: 'You need measured visits from known AI products.',
        reportId: 'ai-referrals',
        doInstead:
          'Run AI referrals. A generated answer or citation does not prove that a visit reached the site.',
      },
    ],
    seo: {
      primaryKeyword: 'ai prompt monitoring',
      supportingKeywords: [
        'chatgpt citation tracking',
        'ai answer monitoring',
        'ai visibility tracking',
      ],
    },
  },
}
