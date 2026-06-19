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
    id: 'title_too_short',
    title: 'Title too short',
    category: 'metadata',
    defaultSeverity: 'low',
    whyItMatters:
      'Very short titles waste the search-result headline and usually omit the useful words people scan for.',
    howToFix:
      'Expand the title so it clearly names the page topic, entity, product, or location. Aim for a useful human headline, not keyword stuffing.',
    impactIfIgnored:
      'The page may look generic in search and send weaker topical signals than competing pages.',
    howToVerify:
      'Re-run the crawl and confirm the title length is at least 30 characters.',
    agentHints: {
      evidenceFields: ['page.title', 'issue.evidence.length'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'title_duplicate',
    title: 'Duplicate title',
    category: 'metadata',
    defaultSeverity: 'medium',
    whyItMatters:
      'When multiple pages share the same title, search engines and users get a weaker signal about which page is the right result.',
    howToFix:
      'Rewrite each title so it reflects the specific page, including the unique entity, intent, location, product, or angle.',
    impactIfIgnored:
      'Search engines may pick the wrong page to rank, and users may see repetitive snippets that do not explain the difference.',
    howToVerify:
      'Re-run the crawl and confirm this title appears on only one indexable URL.',
    agentHints: {
      evidenceFields: [
        'page.title',
        'issue.evidence.duplicateCount',
        'issue.evidence.sampleUrls',
      ],
      suggestedCommands: ['seo crawl <url> --json'],
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
    id: 'h1_missing',
    title: 'Missing H1',
    category: 'headings',
    defaultSeverity: 'medium',
    whyItMatters:
      'The H1 is the main visible page heading. It helps readers, search engines, screen readers, and AI systems understand the primary topic.',
    howToFix:
      'Add one clear H1 near the top of the main content. Make it describe the specific page, not just a generic section label.',
    impactIfIgnored:
      'The page has weaker topical clarity and may be harder to understand or cite.',
    howToVerify:
      'Re-run the crawl and confirm h1Count is 1 and the H1 text matches the page intent.',
    agentHints: {
      evidenceFields: ['page.h1', 'page.h1Count'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'multiple_h1',
    title: 'Multiple H1s',
    category: 'headings',
    defaultSeverity: 'low',
    whyItMatters:
      'Multiple H1s can blur the primary topic and make the page outline less predictable for crawlers and assistive technology.',
    howToFix:
      'Keep the main page topic as the only H1. Demote secondary section titles to H2 or H3.',
    impactIfIgnored:
      'The heading hierarchy stays noisy, especially on templates reused across many pages.',
    howToVerify: 'Re-run the crawl and confirm h1Count is exactly 1.',
    agentHints: {
      evidenceFields: ['page.h1Count'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'heading_structure_weak',
    title: 'Weak heading structure',
    category: 'headings',
    defaultSeverity: 'low',
    whyItMatters:
      'Long pages without supporting section headings are harder to scan, parse, and turn into direct answers.',
    howToFix:
      'Break the main content into clear H2/H3 sections that match the questions and subtopics readers expect.',
    impactIfIgnored:
      'Users skim less effectively, and crawlers or AI agents get fewer structural cues about the page.',
    howToVerify:
      'Re-run the crawl and confirm longer pages have supporting H2 or H3 headings.',
    agentHints: {
      evidenceFields: ['page.h2Count', 'page.h3Count', 'page.wordCount'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
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
    id: 'canonical_non_absolute',
    title: 'Canonical is not absolute',
    category: 'canonical',
    defaultSeverity: 'low',
    whyItMatters:
      'Search engines can usually resolve relative canonicals, but absolute canonical URLs are clearer and less fragile across mirrors, previews, and rendered variants.',
    howToFix:
      'Use a full https URL in the canonical tag, including protocol, host, and path.',
    impactIfIgnored:
      'Canonical signals are easier to misread when pages are copied, proxied, or rendered from alternate origins.',
    howToVerify:
      'Re-run the crawl and confirm canonicalRaw starts with http:// or https://.',
    agentHints: {
      evidenceFields: ['page.canonicalRaw', 'page.canonical'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'canonical_chain',
    title: 'Canonical chain',
    category: 'canonical',
    defaultSeverity: 'medium',
    whyItMatters:
      'A canonical that points to another URL which then canonicalizes again creates an indirect consolidation path.',
    howToFix:
      'Point the first page directly at the final preferred URL, or make the intermediate canonical target self-referencing.',
    impactIfIgnored:
      'Search engines may ignore or reinterpret the canonical path, especially at scale.',
    howToVerify:
      'Re-run the crawl and confirm the canonical target is self-referencing.',
    agentHints: {
      evidenceFields: [
        'page.canonical',
        'issue.evidence.nextCanonical',
        'issue.evidence.chain',
      ],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'connection_error',
    title: 'Connection error',
    category: 'response',
    defaultSeverity: 'high',
    whyItMatters:
      'A URL that cannot be fetched is invisible to users, search crawlers, and AI agents. It may be a DNS, TLS, timeout, firewall, or server availability problem.',
    howToFix:
      'Check DNS, TLS certificates, firewall/CDN rules, server logs, and timeout behavior. Make the URL return a stable 2xx response or one direct redirect to the replacement.',
    impactIfIgnored:
      'The page cannot be crawled, ranked, or cited while the connection failure remains.',
    howToVerify:
      'Re-run the crawl and confirm the URL returns a normal HTTP status instead of status 0.',
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
    id: 'redirected_url',
    title: 'URL redirects',
    category: 'response',
    defaultSeverity: 'medium',
    whyItMatters:
      'Redirects are sometimes intentional, but unnecessary redirects slow users, dilute crawl clarity, and can hide broken migration paths.',
    howToFix:
      'Update internal links, canonicals, and sitemap entries to the final URL. Keep one direct 301 only when the old URL must remain supported.',
    impactIfIgnored:
      'Search engines and users keep passing through an avoidable hop, and future redirects can become chains or loops.',
    howToVerify:
      'Re-run the crawl and confirm the requested URL is the same as the final URL, or that the redirect is intentional.',
    agentHints: {
      evidenceFields: ['page.url', 'page.finalUrl', 'page.status'],
      suggestedCommands: ['seo redirect-trace --url <url> --json'],
    },
  },
  {
    id: 'redirect_chain',
    title: 'Redirect chain',
    category: 'response',
    defaultSeverity: 'medium',
    whyItMatters:
      'Multiple redirect hops slow users and crawlers, and each hop is another place a migration can break.',
    howToFix:
      'Point internal links, canonicals, and sitemap URLs directly at the final destination. Keep only one necessary 301 from old URLs.',
    impactIfIgnored:
      'Pages load slower, crawl paths are less clear, and future redirects can turn into loops or dead ends.',
    howToVerify:
      'Re-run the crawl and confirm fetchDiagnostics.redirectChain has zero or one hop.',
  },
  {
    id: 'slow_response',
    title: 'Slow response',
    category: 'response',
    defaultSeverity: 'medium',
    whyItMatters:
      'Slow HTML responses delay every user and crawler before rendering or assets even begin.',
    howToFix:
      'Check server timing, cache headers, database queries, CDN caching, and origin health. Aim for fast, cacheable HTML for public pages.',
    impactIfIgnored:
      'Users wait longer, crawlers spend more time per URL, and important pages may feel unreliable.',
    howToVerify:
      'Re-run the crawl and confirm responseTimeMs is under the slow-response threshold.',
  },
  {
    id: 'broken_internal_link',
    title: 'Broken internal link',
    category: 'links',
    defaultSeverity: 'high',
    whyItMatters:
      'Internal links that land on broken URLs waste crawl paths, frustrate users, and leak authority inside the site.',
    howToFix:
      'Update every internal link to the working destination, restore the missing page, or add one direct 301 to the best replacement.',
    impactIfIgnored:
      'Users hit dead ends and search engines keep discovering broken URLs from your own pages.',
    howToVerify:
      'Re-run the crawl and confirm the linked URL no longer returns a broken status.',
  },
  {
    id: 'broken_external_link',
    title: 'Broken external link',
    category: 'links',
    defaultSeverity: 'medium',
    whyItMatters:
      'External links are part of the page experience and source trail. Broken references make content feel stale and less trustworthy.',
    howToFix:
      'Replace the link with a working source, update the URL, or remove the reference if it no longer supports the page.',
    impactIfIgnored:
      'Readers and agents following citations hit dead ends, which weakens trust in the content.',
    howToVerify:
      'Re-run the crawl with external checks enabled and confirm the external link no longer appears in externalLinkChecks as broken.',
  },
  {
    id: 'orphan_page',
    title: 'Orphan page',
    category: 'links',
    defaultSeverity: 'medium',
    whyItMatters:
      'A page with no internal links is hard for users and crawlers to discover, even if it appears in a sitemap.',
    howToFix:
      'Add relevant internal links from hubs, navigation, related pages, or templates that naturally point to this page.',
    impactIfIgnored:
      'The page can stay isolated, receive less authority, and be crawled less consistently.',
    howToVerify:
      'Re-run the crawl and confirm internalInlinkCount is greater than zero.',
  },
  {
    id: 'deep_page',
    title: 'Deep page',
    category: 'links',
    defaultSeverity: 'low',
    whyItMatters:
      'Important pages buried many clicks deep are harder for users and crawlers to reach.',
    howToFix:
      'Link the page from a closer hub, category page, related content block, or navigation path.',
    impactIfIgnored:
      'The page may receive weaker internal authority and be discovered later during crawls.',
    howToVerify:
      'Re-run the crawl and confirm crawlDepth is closer to the homepage.',
  },
  {
    id: 'weak_internal_links_to_valuable_page',
    title: 'Valuable page has weak internal links',
    category: 'links',
    defaultSeverity: 'medium',
    whyItMatters:
      'Pages already earning search or analytics value should be easy to reach and strongly linked from relevant parts of the site.',
    howToFix:
      'Add contextual internal links from high-level pages, related templates, and pages that share the same intent.',
    impactIfIgnored:
      'Useful pages may keep underperforming because the site does not pass enough internal authority to them.',
    howToVerify:
      'Re-run the crawl and confirm internalInlinkCount or internalLinkAuthorityScore improved for the page.',
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
    id: 'meta_description_too_short',
    title: 'Meta description too short',
    category: 'metadata',
    defaultSeverity: 'low',
    whyItMatters:
      'Very short descriptions under-use the snippet space and rarely give searchers enough reason to click.',
    howToFix:
      'Write a clear one- or two-sentence description that summarizes the page value and matches the likely search intent.',
    impactIfIgnored:
      'Search engines may replace the snippet or show copy that does not sell the page well.',
    howToVerify:
      'Re-run the crawl and confirm the description is at least 70 characters.',
    agentHints: {
      evidenceFields: ['page.metaDescription', 'issue.evidence.length'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'meta_description_too_long',
    title: 'Meta description too long',
    category: 'metadata',
    defaultSeverity: 'low',
    whyItMatters:
      'Over-long descriptions are likely to be truncated or rewritten, which can hide the most useful click promise.',
    howToFix:
      'Tighten the description to the clearest value proposition and put the most important words near the front.',
    impactIfIgnored:
      'The visible snippet may cut off the strongest part of the message or get replaced by generated text.',
    howToVerify:
      'Re-run the crawl and confirm the description is no longer over 160 characters.',
    agentHints: {
      evidenceFields: ['page.metaDescription', 'issue.evidence.length'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'meta_description_duplicate',
    title: 'Duplicate meta description',
    category: 'metadata',
    defaultSeverity: 'medium',
    whyItMatters:
      'Repeated descriptions make different pages look interchangeable and can weaken snippet quality across a section.',
    howToFix:
      'Write a distinct description for each page that explains what is unique about that URL.',
    impactIfIgnored:
      'Search snippets stay generic, and search engines may rewrite them or struggle to distinguish similar pages.',
    howToVerify:
      'Re-run the crawl and confirm this description appears on only one URL.',
    agentHints: {
      evidenceFields: [
        'page.metaDescription',
        'issue.evidence.duplicateCount',
        'issue.evidence.sampleUrls',
      ],
      suggestedCommands: ['seo crawl <url> --json'],
    },
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
    id: 'nofollow',
    title: 'Nofollow found',
    category: 'indexability',
    defaultSeverity: 'low',
    whyItMatters:
      'Nofollow asks crawlers not to follow links from the page. On important pages, that can block discovery and weaken internal authority flow.',
    howToFix:
      'Remove nofollow from meta robots or X-Robots-Tag unless the page is intentionally isolated from link discovery.',
    impactIfIgnored:
      'Internal links on the page may pass weaker discovery and authority signals.',
    howToVerify:
      'Re-run the crawl and confirm metaRobots and xRobotsTag no longer contain nofollow.',
    agentHints: {
      evidenceFields: ['page.metaRobots', 'page.xRobotsTag'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'x_robots_noindex',
    title: 'X-Robots-Tag noindex',
    category: 'indexability',
    defaultSeverity: 'medium',
    whyItMatters:
      'An X-Robots-Tag noindex header can remove a page from search even when the HTML looks indexable.',
    howToFix:
      'Remove the noindex directive from server, CDN, or framework response headers if the page should rank.',
    impactIfIgnored:
      'The page remains excluded from search results while the header is present.',
    howToVerify:
      'Re-run the crawl and confirm xRobotsTag no longer contains noindex.',
    agentHints: {
      evidenceFields: ['page.xRobotsTag', 'page.responseHeaders'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'robots_blocked',
    title: 'Blocked by robots.txt',
    category: 'indexability',
    defaultSeverity: 'medium',
    whyItMatters:
      'Robots.txt blocking prevents crawlers from fetching the URL. If accidental, search engines and AI systems cannot evaluate the page content.',
    howToFix:
      'Update robots.txt so important public pages are allowed, or leave the block in place only for intentionally private or low-value paths.',
    impactIfIgnored:
      'The page may stay uncrawled, stale, or missing from search and AI retrieval systems.',
    howToVerify:
      'Re-run the crawl and confirm robotsTxt.allowed is true for the URL.',
    agentHints: {
      evidenceFields: ['page.robotsTxt'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'canonicalized_page',
    title: 'Canonicalized page',
    category: 'indexability',
    defaultSeverity: 'low',
    whyItMatters:
      'A canonicalized page tells search engines another URL should receive the ranking signals. That is fine when intentional and risky when accidental.',
    howToFix:
      'If this URL should rank, make the canonical self-referencing. If another URL is preferred, make internal links and sitemap entries point to that preferred URL.',
    impactIfIgnored:
      'The page may be excluded from search in favor of the canonical target.',
    howToVerify:
      'Re-run the crawl and confirm the canonical target matches the intended indexable URL.',
    agentHints: {
      evidenceFields: ['page.canonical', 'page.finalUrl', 'page.indexability'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
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
