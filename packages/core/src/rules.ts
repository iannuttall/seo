type RuleDefinition = {
  id: string
  title: string
  category:
    | 'canonical'
    | 'content'
    | 'response'
    | 'headings'
    | 'images'
    | 'indexability'
    | 'international'
    | 'links'
    | 'metadata'
    | 'mobile'
    | 'performance'
    | 'social'
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
  {
    id: 'client_error',
    title: 'Client error',
    category: 'response',
    defaultSeverity: 'high',
    whyItMatters:
      'A 4xx URL is a dead end for users and search engines. Internal links to 4xx pages waste crawl attention and leak authority.',
    howToFix:
      'Restore the page, update links to the correct URL, or add one direct 301 to the best replacement.',
    impactIfIgnored:
      'Users hit broken pages and search engines may drop the URL or reduce trust in nearby internal links.',
    howToVerify:
      'Re-run the crawl and confirm the URL returns a 2xx status or redirects once to a useful replacement.',
  },
  {
    id: 'server_error',
    title: 'Server error',
    category: 'response',
    defaultSeverity: 'high',
    whyItMatters:
      'A 5xx means the server failed to deliver the page. Persistent 5xx errors can slow crawling and remove pages from search.',
    howToFix:
      'Check application logs, hosting health, upstream services, and cache/CDN rules. Return 200 when fixed, or 503 only for planned maintenance.',
    impactIfIgnored:
      'Search engines may crawl less often and users cannot reach the affected pages.',
    howToVerify:
      'Re-run the crawl and confirm the affected URL no longer returns a 5xx status.',
  },
  {
    id: 'missing_meta_description',
    title: 'Meta description missing',
    category: 'metadata',
    defaultSeverity: 'medium',
    whyItMatters:
      'The meta description is often used as search-result copy. Without it, search engines choose their own snippet.',
    howToFix:
      'Write a concise, unique description that explains the page value and matches the main search intent.',
    impactIfIgnored:
      'Search snippets may be generic or less persuasive, especially on pages that already rank.',
    howToVerify:
      'Re-run the crawl and confirm the page has a meta description.',
  },
  {
    id: 'canonical_missing',
    title: 'Canonical missing',
    category: 'canonical',
    defaultSeverity: 'low',
    whyItMatters:
      'A canonical tells search engines which URL is preferred when duplicates or parameters exist.',
    howToFix:
      'Add a self-referencing canonical to pages that should be indexable.',
    impactIfIgnored:
      'Search engines may choose the wrong URL variant or split signals across duplicates.',
    howToVerify:
      'Re-run the crawl and confirm the canonical field is present and points to the preferred URL.',
  },
  {
    id: 'noindex',
    title: 'Noindex found',
    category: 'indexability',
    defaultSeverity: 'medium',
    whyItMatters:
      'Noindex tells search engines not to show the page in search results. It is useful when intentional and risky when accidental.',
    howToFix:
      'Remove the noindex directive if the page should rank. Leave it in place only for intentionally private or low-value pages.',
    impactIfIgnored:
      'The page cannot earn organic search traffic while the noindex directive remains.',
    howToVerify:
      'Re-run the crawl or URL Inspection and confirm no meta robots or X-Robots-Tag noindex remains.',
  },
  {
    id: 'thin_content',
    title: 'Thin content',
    category: 'content',
    defaultSeverity: 'low',
    whyItMatters:
      'Pages with little useful content rarely satisfy search intent and are poor candidates for AI citation.',
    howToFix:
      'Add genuinely useful sections, examples, details, and answers that match the page intent.',
    impactIfIgnored:
      'The page is easier to outrank and less likely to be cited or used by answer engines.',
    howToVerify:
      'Re-run the crawl and confirm the word count and extracted content are substantial for the page type.',
  },
  {
    id: 'image_missing_alt',
    title: 'Images missing alt text',
    category: 'images',
    defaultSeverity: 'medium',
    whyItMatters:
      'Alt text helps screen-reader users and gives search engines context for meaningful images.',
    howToFix:
      'Add concise alt text for meaningful images. Use empty alt text only for decorative images.',
    impactIfIgnored:
      'The page has accessibility gaps and weaker image-search context.',
    howToVerify:
      'Re-run the crawl and confirm imagesMissingAlt is zero or only decorative images are empty.',
  },
  {
    id: 'viewport_missing',
    title: 'Viewport missing',
    category: 'mobile',
    defaultSeverity: 'medium',
    whyItMatters:
      'The viewport tag lets mobile browsers render responsive layouts correctly.',
    howToFix:
      'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to the document head.',
    impactIfIgnored:
      'Mobile users may get a zoomed-out desktop page and mobile-first search quality can suffer.',
    howToVerify: 'Re-run the crawl and confirm hasViewport is true.',
  },
  {
    id: 'lang_missing',
    title: 'Language missing',
    category: 'international',
    defaultSeverity: 'low',
    whyItMatters:
      'The html lang attribute helps browsers, screen readers, search engines, and translators understand the page language.',
    howToFix:
      'Set the language on the root html element, for example `<html lang="en">`.',
    impactIfIgnored: 'Accessibility and language targeting signals are weaker.',
    howToVerify: 'Re-run the crawl and confirm the lang field is populated.',
  },
  {
    id: 'structured_data_missing',
    title: 'Structured data missing',
    category: 'structured-data',
    defaultSeverity: 'low',
    whyItMatters:
      'Structured data helps search and AI systems understand entities, page type, authorship, and facts.',
    howToFix:
      'Add relevant JSON-LD such as Article, Product, FAQPage, BreadcrumbList, Organization, or WebPage.',
    impactIfIgnored:
      'The page has weaker machine-readable context and fewer rich-result opportunities.',
    howToVerify:
      'Re-run the crawl and confirm schemaTypes includes the expected schema.',
  },
  {
    id: 'og_title_missing',
    title: 'Open Graph title missing',
    category: 'social',
    defaultSeverity: 'low',
    whyItMatters:
      'Open Graph tags control how pages appear in social feeds, chat previews, and many sharing surfaces.',
    howToFix:
      'Add an og:title that matches the page title or a share-friendly version of it.',
    impactIfIgnored:
      'Shared links can look generic, reducing clicks from social and messaging apps.',
    howToVerify: 'Re-run the crawl and confirm openGraphTitle is present.',
  },
  {
    id: 'twitter_card_missing',
    title: 'Twitter card missing',
    category: 'social',
    defaultSeverity: 'low',
    whyItMatters:
      'Twitter/X card tags help shared links render as rich previews instead of plain URLs.',
    howToFix:
      'Add twitter:card and matching title, description, and image tags where useful.',
    impactIfIgnored:
      'Links shared on Twitter/X may earn fewer clicks because the preview is weaker.',
    howToVerify: 'Re-run the crawl and confirm twitterCard is present.',
  },
  {
    id: 'geo_no_structured_data',
    title: 'GEO: no machine-readable structure',
    category: 'geo',
    defaultSeverity: 'medium',
    whyItMatters:
      'Generative engines rely on clear structure to identify facts, entities, and source credibility.',
    howToFix:
      'Add relevant JSON-LD and keep visible page content aligned with the structured data.',
    impactIfIgnored:
      'The page is harder for AI systems to understand and cite confidently.',
    howToVerify: 'Re-run the crawl and confirm geo.structuredData is true.',
  },
  {
    id: 'geo_not_answerable',
    title: 'GEO: not answer-ready',
    category: 'geo',
    defaultSeverity: 'low',
    whyItMatters:
      'AI answer engines prefer clear headings followed by direct, self-contained answers.',
    howToFix:
      'Put the direct answer near the top of each important section, then add supporting detail.',
    impactIfIgnored:
      'The page may be skipped in favor of competitors with cleaner answer blocks.',
    howToVerify:
      'Re-run the crawl and confirm geo.answerable is true for important pages.',
  },
  {
    id: 'geo_no_author',
    title: 'GEO: authorship missing',
    category: 'geo',
    defaultSeverity: 'low',
    whyItMatters:
      'Authorship is a trust signal for users, search engines, and AI systems deciding whether to cite a page.',
    howToFix:
      'Add a named author, byline, author schema, or organization attribution where appropriate.',
    impactIfIgnored: 'The page has weaker trust and attribution signals.',
    howToVerify: 'Re-run the crawl and confirm geo.hasAuthor is true.',
  },
  {
    id: 'geo_no_semantic_html',
    title: 'GEO: weak semantic HTML',
    category: 'geo',
    defaultSeverity: 'low',
    whyItMatters:
      'Semantic landmarks help machines separate main content from navigation, ads, and boilerplate.',
    howToFix:
      'Use main, article, section, and a logical heading outline around the primary content.',
    impactIfIgnored:
      'AI systems may extract the wrong content or miss the main answer.',
    howToVerify: 'Re-run the crawl and confirm geo.semanticHtml is true.',
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
