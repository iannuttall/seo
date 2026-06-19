type RuleDefinition = {
  id: string
  title: string
  category:
    | 'canonical'
    | 'content'
    | 'headings'
    | 'indexability'
    | 'links'
    | 'metadata'
    | 'performance'
    | 'structured-data'
    | 'geo'
  defaultSeverity: 'low' | 'medium' | 'high'
  whyItMatters: string
  howToFix: string
  impactIfIgnored: string
  howToVerify: string
  agentHints?: {
    evidenceFields?: string[]
    suggestedCommands?: string[]
  }
}

const RULE_DEFINITIONS = [
  {
    id: 'missing_title',
    title: 'Title missing',
    category: 'metadata',
    defaultSeverity: 'high',
    whyItMatters:
      'The title is the main search-result headline and one of the clearest page-topic signals. Without it, search engines invent a label and users get a weaker reason to click.',
    howToFix:
      'Add one descriptive title that names the page topic and matches the main query intent. Keep it useful for humans first.',
    impactIfIgnored:
      'The page can look vague in search results, earn lower CTR, and send weaker relevance signals.',
    howToVerify:
      'Re-run `seo audit-page --url <url>` and confirm the title is present in the page audit output.',
    agentHints: {
      evidenceFields: ['page.title'],
      suggestedCommands: ['seo audit-page --url <url> --json'],
    },
  },
  {
    id: 'title_too_wide',
    title: 'Title likely truncates',
    category: 'metadata',
    defaultSeverity: 'medium',
    whyItMatters:
      'Over-wide titles are often truncated in search results, hiding the part that explains why the page is relevant.',
    howToFix:
      'Tighten the title, front-load the important phrase, and remove filler that does not help the searcher choose the page.',
    impactIfIgnored:
      'Search snippets may cut off the strongest wording, which can reduce click-through even when rankings hold.',
    howToVerify:
      'Re-run the page audit and confirm the estimated title width no longer exceeds the SERP budget.',
    agentHints: {
      evidenceFields: ['page.title'],
      suggestedCommands: ['seo audit-page --url <url> --json'],
    },
  },
  {
    id: 'h1_count',
    title: 'H1 structure issue',
    category: 'headings',
    defaultSeverity: 'medium',
    whyItMatters:
      'The H1 should make the page topic obvious to readers, search engines, and assistive technology. Missing or competing H1s blur that signal.',
    howToFix:
      'Use one clear H1 for the main page topic. Demote secondary headings to H2 or H3 so the page outline is easy to parse.',
    impactIfIgnored:
      'The page has weaker topical clarity and may be harder for humans, crawlers, and AI systems to interpret.',
    howToVerify:
      'Re-run `seo audit-page --url <url>` and confirm exactly one H1 is detected.',
    agentHints: {
      evidenceFields: ['page.headings'],
      suggestedCommands: ['seo audit-page --url <url> --json'],
    },
  },
  {
    id: 'canonical_mismatch',
    title: 'Canonical differs from final URL',
    category: 'canonical',
    defaultSeverity: 'medium',
    whyItMatters:
      'A canonical pointing somewhere else tells search engines that another URL may be the preferred page. That is useful when intentional and risky when accidental.',
    howToFix:
      'If this page should rank, make the canonical self-referencing. If another URL is preferred, make sure internal links and redirects also point there.',
    impactIfIgnored:
      'Search engines may consolidate signals into the wrong URL or drop this URL from search results.',
    howToVerify:
      'Re-run the page audit and confirm the canonical matches the fetched final URL, or inspect the preferred target instead.',
    agentHints: {
      evidenceFields: ['page.canonical', 'page.finalUrl'],
      suggestedCommands: ['seo audit-page --url <url> --json'],
    },
  },
] as const satisfies readonly RuleDefinition[]

export type RuleId = (typeof RULE_DEFINITIONS)[number]['id']
export type RuleInfo = (typeof RULE_DEFINITIONS)[number]
export type RuleCategory = RuleDefinition['category']
export type RuleSeverity = RuleDefinition['defaultSeverity']

const RULES_BY_ID = new Map<string, RuleInfo>(
  RULE_DEFINITIONS.map((rule) => [rule.id, rule]),
)

export function listRules(): RuleInfo[] {
  return [...RULE_DEFINITIONS]
}

export function explainRule(ruleId: string): RuleInfo | undefined {
  return RULES_BY_ID.get(ruleId)
}

export function hasRule(ruleId: string): ruleId is RuleId {
  return RULES_BY_ID.has(ruleId)
}
