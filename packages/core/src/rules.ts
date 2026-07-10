// biome-ignore-all lint/style/noExcessiveLinesPerFile: central rule guidance registry for CLI and MCP parity.

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
    | 'security'
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
    id: 'canonical_invalid',
    title: 'Canonical URL is invalid',
    category: 'canonical',
    defaultSeverity: 'high',
    whyItMatters:
      'A malformed or non-HTTP canonical cannot identify a valid preferred page and may be ignored by search engines.',
    howToFix:
      'Replace it with one absolute HTTP or HTTPS URL for the intended preferred page.',
    impactIfIgnored:
      'Search engines receive unusable consolidation evidence and may choose a different canonical on their own.',
    howToVerify:
      'Re-run the page audit and confirm the canonical resolves to the intended HTTP or HTTPS URL.',
    agentHints: {
      evidenceFields: [
        'page.canonical',
        'page.canonicalRaw',
        'issue.evidence.canonicalRaw',
      ],
      suggestedCommands: ['seo audit-page --url <url> --json'],
    },
  },
  {
    id: 'canonical_conflict',
    title: 'Canonical declarations conflict',
    category: 'canonical',
    defaultSeverity: 'high',
    whyItMatters:
      'Different canonical targets in HTML or HTTP headers give search engines contradictory consolidation signals.',
    howToFix:
      'Choose one preferred absolute URL and make every canonical declaration agree, or remove the extra declaration source.',
    impactIfIgnored:
      'Search engines may ignore the declarations or select a different canonical than the site intended.',
    howToVerify:
      'Re-run the crawl and confirm canonicalStatus is single with one intended target.',
    agentHints: {
      evidenceFields: ['page.canonicalCandidates', 'page.canonicalStatus'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'canonical_multiple',
    title: 'Canonical declared more than once',
    category: 'canonical',
    defaultSeverity: 'low',
    whyItMatters:
      'Repeated canonical declarations are error-prone even when they currently point to the same URL.',
    howToFix:
      'Keep one canonical method per response where practical. If HTML and HTTP headers are both required, keep their targets identical.',
    impactIfIgnored:
      'A future template or header change can create a hidden canonical conflict.',
    howToVerify: 'Re-run the crawl and confirm canonicalStatus is single.',
    agentHints: {
      evidenceFields: ['page.canonicalCandidates', 'page.canonicalStatus'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'canonical_outside_head',
    title: 'Canonical appears outside the HTML head',
    category: 'canonical',
    defaultSeverity: 'medium',
    whyItMatters:
      'Google only accepts an HTML canonical link element in the document head.',
    howToFix:
      'Move the canonical link element into a valid head section and keep one absolute preferred URL.',
    impactIfIgnored:
      'The body declaration may be ignored, leaving the page without the intended canonical signal.',
    howToVerify:
      'Re-run the crawl and confirm the canonical candidate source is html-head.',
    agentHints: {
      evidenceFields: ['page.canonicalCandidates', 'page.canonicalStatus'],
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
    id: 'large_html',
    title: 'Large HTML response',
    category: 'performance',
    defaultSeverity: 'low',
    whyItMatters:
      'Large HTML takes longer to download and parse before the browser can even start the rest of the page.',
    howToFix:
      'Trim duplicated markup, remove heavy inline data, split non-critical content, and move large scripts or styles out of the HTML response.',
    impactIfIgnored:
      'Pages can feel slow on mobile connections and crawlers spend more time processing each URL.',
    howToVerify:
      'Re-run the crawl and confirm sizeBytes is below the large HTML threshold for normal pages.',
    agentHints: {
      evidenceFields: ['page.sizeBytes', 'issue.evidence.thresholdBytes'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'no_compression',
    title: 'No text compression',
    category: 'performance',
    defaultSeverity: 'low',
    whyItMatters:
      'HTML without gzip or brotli sends more bytes than necessary and slows every first page load.',
    howToFix:
      'Enable gzip or brotli for HTML and other text responses at the server, CDN, or reverse proxy.',
    impactIfIgnored:
      'Users download more data, pages load slower, and the origin may spend more bandwidth than needed.',
    howToVerify:
      'Re-run the crawl and confirm compression is br or gzip for sizeable HTML responses.',
    agentHints: {
      evidenceFields: [
        'page.compression',
        'page.sizeBytes',
        'issue.evidence.thresholdBytes',
      ],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'http_not_secure',
    title: 'Page is not served over HTTPS',
    category: 'security',
    defaultSeverity: 'medium',
    whyItMatters:
      'HTTPS is a baseline trust signal. Browsers label HTTP pages as not secure, and users can be intercepted or downgraded.',
    howToFix:
      'Install TLS, serve the page on HTTPS, and redirect the HTTP URL to the HTTPS version with a permanent redirect.',
    impactIfIgnored:
      'Users see trust warnings, conversions suffer, and search quality signals are weaker.',
    howToVerify:
      'Re-run the crawl and confirm finalUrl starts with https:// and isHttps is true.',
  },
  {
    id: 'mixed_content',
    title: 'Mixed content',
    category: 'security',
    defaultSeverity: 'medium',
    whyItMatters:
      'An HTTPS page that loads HTTP resources can trigger browser warnings or blocked images, scripts, fonts, or media.',
    howToFix:
      'Change insecure resource URLs to HTTPS, update CDN origins, or remove resources that are no longer available securely.',
    impactIfIgnored:
      'Parts of the page may break, users lose trust, and the security guarantee of HTTPS is weakened.',
    howToVerify: 'Re-run the crawl and confirm mixedContentCount is zero.',
    agentHints: {
      evidenceFields: [
        'page.mixedContentSamples',
        'issue.evidence.mixedContentSamples',
      ],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'hsts_missing',
    title: 'HSTS header missing',
    category: 'security',
    defaultSeverity: 'low',
    whyItMatters:
      'HSTS tells browsers to keep using HTTPS, which reduces downgrade risk after the first secure visit.',
    howToFix:
      'Send a Strict-Transport-Security header with a suitable max-age once the whole site is stable on HTTPS.',
    impactIfIgnored:
      'Repeat visitors have a larger downgrade window if a network or link tries to send them to HTTP.',
    howToVerify:
      'Re-run the crawl and confirm hasHsts is true for HTTPS pages.',
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
      'A canonical can clarify the preferred URL when duplicate or parameter variants exist, though Google does not require one on every page.',
    howToFix:
      'Add a self-referencing canonical when the site uses canonical tags as part of a deliberate duplicate-URL strategy.',
    impactIfIgnored:
      'When duplicate variants exist, search engines may choose a different preferred URL. Unique pages without duplicates may need no action.',
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
      'Re-run the crawl or URL Inspection and confirm no effective meta robots or X-Robots-Tag noindex remains, including the equivalent none directive.',
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
      'Re-run the crawl and confirm the effective meta robots and X-Robots-Tag rules no longer block following, including through the equivalent none directive.',
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
      'Re-run the crawl and confirm the effective X-Robots-Tag rules no longer block indexing, including through the equivalent none directive.',
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
    id: 'duplicate_content',
    title: 'Duplicate content',
    category: 'content',
    defaultSeverity: 'medium',
    whyItMatters:
      'Pages with the same main content force search engines to choose a winner and can split internal signals across duplicates.',
    howToFix:
      'Consolidate duplicate pages with redirects or canonicals, or make each page meaningfully different for its own intent.',
    impactIfIgnored:
      'The wrong URL may rank, similar pages may underperform, and AI systems may cite a less useful duplicate.',
    howToVerify:
      'Re-run the crawl and confirm the duplicate mainContentHash appears on only one URL.',
    agentHints: {
      evidenceFields: [
        'page.mainContentHash',
        'issue.evidence.duplicateCount',
        'issue.evidence.sampleUrls',
      ],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'low_text_ratio',
    title: 'Low text-to-HTML ratio',
    category: 'content',
    defaultSeverity: 'low',
    whyItMatters:
      'A page with lots of markup and very little readable text often behaves like a thin or template-heavy page.',
    howToFix:
      'Add useful visible content, reduce unnecessary markup, and move bulky scripts or styles out of the HTML where practical.',
    impactIfIgnored:
      'Crawlers and AI systems may find less useful content than the page weight suggests.',
    howToVerify:
      'Re-run the crawl and confirm textRatio rises above the low-text threshold.',
    agentHints: {
      evidenceFields: ['page.textRatio', 'page.wordCount', 'page.sizeBytes'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'query_coverage_missing',
    title: 'Top query weakly covered',
    category: 'content',
    defaultSeverity: 'medium',
    whyItMatters:
      'When GSC shows impressions for a query, the page should visibly cover the important query terms in headings, snippets, and body copy.',
    howToFix:
      'Work the missing query terms into the title, H1, description, and relevant body section only where they are genuinely useful.',
    impactIfIgnored:
      'The page can keep earning impressions without enough relevance to improve rank or clicks.',
    howToVerify:
      'Re-run the crawl with the same GSC property and confirm missingTerms is empty or coverage is above the threshold.',
    agentHints: {
      evidenceFields: [
        'page.topQuery',
        'issue.evidence.missingTerms',
        'issue.evidence.coverage',
      ],
      suggestedCommands: ['seo crawl <url> --project <id> --json'],
    },
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
    id: 'image_oversized_candidate',
    title: 'Oversized image candidates',
    category: 'images',
    defaultSeverity: 'low',
    whyItMatters:
      'Very large images can slow pages down, especially when the browser only needs a small rendered size.',
    howToFix:
      'Resize the source image, add responsive srcset sizes, and serve modern compressed formats such as WebP or AVIF where supported.',
    impactIfIgnored:
      'Users may download more image data than needed, which hurts load speed and wastes bandwidth.',
    howToVerify:
      'Re-run the crawl and confirm oversizedImageCandidates is empty, then spot-check the page in a browser performance trace if the image is important.',
    agentHints: {
      evidenceFields: [
        'page.oversizedImageCandidates',
        'issue.evidence.thresholdPx',
        'issue.evidence.candidates',
      ],
      suggestedCommands: ['seo crawl <url> --max-pages 10 --json'],
    },
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
    id: 'hreflang_invalid',
    title: 'Invalid hreflang values',
    category: 'international',
    defaultSeverity: 'low',
    whyItMatters:
      'Invalid hreflang codes can be ignored by search engines, which weakens language and region targeting.',
    howToFix:
      'Use valid language or language-region codes such as en, en-gb, fr-ca, or x-default.',
    impactIfIgnored:
      'Search engines may ignore the annotation and show the wrong regional page.',
    howToVerify: 'Re-run the crawl and confirm every hreflang value is valid.',
    agentHints: {
      evidenceFields: ['page.hreflang', 'issue.evidence.invalid'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'hreflang_duplicate',
    title: 'Duplicate hreflang values',
    category: 'international',
    defaultSeverity: 'low',
    whyItMatters:
      'Duplicate hreflang declarations create conflicting signals when one language code points to more than one URL.',
    howToFix:
      'Keep one URL per hreflang value on each page and remove duplicated alternates.',
    impactIfIgnored:
      'Search engines may ignore the duplicate annotations or pick the wrong regional URL.',
    howToVerify:
      'Re-run the crawl and confirm each hreflang code appears only once per page.',
    agentHints: {
      evidenceFields: ['page.hreflang', 'issue.evidence.duplicateCodes'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'hreflang_incomplete',
    title: 'Hreflang missing self reference',
    category: 'international',
    defaultSeverity: 'low',
    whyItMatters:
      'Hreflang clusters should include the current page language or x-default so engines can trust the set.',
    howToFix:
      'Add a self-referencing hreflang entry, or include x-default when the page is part of an international cluster.',
    impactIfIgnored:
      'Search engines may treat the hreflang set as incomplete and show less relevant language variants.',
    howToVerify:
      'Re-run the crawl and confirm hreflang includes the page language or x-default.',
    agentHints: {
      evidenceFields: ['page.lang', 'page.hreflang'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'structured_data_missing',
    title: 'Structured data missing',
    category: 'structured-data',
    defaultSeverity: 'low',
    whyItMatters:
      'Applicable structured data can make a page eligible for specific Google Search features, but missing markup is not a universal technical defect.',
    howToFix:
      'Add only the supported type and properties that accurately describe the visible page. Do not add schema just to satisfy a score.',
    impactIfIgnored:
      'The page may miss an applicable rich-result opportunity; ordinary indexing and ranking do not require structured data.',
    howToVerify:
      'Re-run the crawl and confirm schemaTypes includes the expected schema.',
  },
  {
    id: 'jsonld_invalid',
    title: 'Invalid JSON-LD',
    category: 'structured-data',
    defaultSeverity: 'medium',
    whyItMatters:
      'Broken JSON-LD can make structured data unreadable even when the right schema was intended.',
    howToFix:
      'Fix the JSON syntax in each application/ld+json script. Validate quotes, commas, braces, and any server-rendered values inserted into the block.',
    impactIfIgnored:
      'Search and AI systems may ignore the structured data, which weakens rich-result and citation context.',
    howToVerify:
      'Re-run the crawl and confirm invalidJsonLdCount is zero, then validate the page with a structured data tester.',
    agentHints: {
      evidenceFields: [
        'page.invalidJsonLdSamples',
        'issue.evidence.invalidJsonLdSamples',
      ],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
  },
  {
    id: 'rich_result_required_fields_missing',
    title: 'Required rich-result properties are missing',
    category: 'structured-data',
    defaultSeverity: 'medium',
    whyItMatters:
      'Schema.org vocabulary and valid JSON syntax do not make markup eligible for a Google rich result when documented required properties are absent.',
    howToFix:
      'Add the missing properties only when they accurately represent visible page content. Follow the linked Google feature documentation and validate the result.',
    impactIfIgnored:
      'Google can understand some of the markup while still treating the item as ineligible for that enhanced Search feature.',
    howToVerify:
      'Re-run the crawl, review googleRichResults, and confirm no supported item reports missing-required-properties. Then use Google’s Rich Results Test.',
    agentHints: {
      evidenceFields: ['page.googleRichResults', 'issue.evidence.assessments'],
      suggestedCommands: ['seo crawl <url> --max-pages 1 --json'],
    },
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
    id: 'og_description_missing',
    title: 'Open Graph description missing',
    category: 'social',
    defaultSeverity: 'low',
    whyItMatters:
      'The Open Graph description is often the short pitch shown when a page is shared in chat, Slack, social feeds, and link previews.',
    howToFix:
      'Add an og:description that briefly explains why the page is worth opening.',
    impactIfIgnored:
      'Shared links can appear vague or empty, which reduces clicks from discovery surfaces.',
    howToVerify:
      'Re-run the crawl and confirm openGraphDescription is present.',
  },
  {
    id: 'og_image_missing',
    title: 'Open Graph image missing',
    category: 'social',
    defaultSeverity: 'low',
    whyItMatters:
      'An Open Graph image helps shared links stand out and makes previews feel trustworthy and complete.',
    howToFix:
      'Add an og:image URL with a representative image that crawlers can fetch over HTTPS.',
    impactIfIgnored:
      'Shared links may render without a visual preview, reducing click appeal.',
    howToVerify: 'Re-run the crawl and confirm openGraphImage is present.',
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
    defaultSeverity: 'low',
    whyItMatters:
      'Structured data can describe supported entities and page features, but it is not a general requirement for inclusion in AI search features.',
    howToFix:
      'Do not add markup solely for AI visibility. Use an applicable supported type and keep it aligned with visible content.',
    impactIfIgnored:
      'There is no standalone penalty; only applicable structured-data search features may be unavailable.',
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
    id: 'geo_no_date',
    title: 'GEO: date missing',
    category: 'geo',
    defaultSeverity: 'low',
    whyItMatters:
      'Dates help AI systems and users judge freshness, especially for topics where advice, pricing, or rules change.',
    howToFix:
      'Add a visible published or updated date, and mirror it in Article or WebPage structured data where appropriate.',
    impactIfIgnored:
      'The page may look stale or harder to trust when an answer engine chooses sources.',
    howToVerify: 'Re-run the crawl and confirm geo.hasDate is true.',
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
  {
    id: 'geo_thin_to_cite',
    title: 'GEO: too thin to cite',
    category: 'geo',
    defaultSeverity: 'low',
    whyItMatters:
      'AI answer engines need self-contained passages with enough context to quote or summarize confidently.',
    howToFix:
      'Add substantive definitions, specifics, examples, data, caveats, and direct answers that can stand alone outside the page.',
    impactIfIgnored:
      'There may not be enough useful material for an AI system to cite, even if the page is technically crawlable.',
    howToVerify:
      'Re-run the crawl and confirm wordCount is above the citation-depth threshold for important pages.',
    agentHints: {
      evidenceFields: ['page.wordCount', 'issue.evidence.threshold'],
      suggestedCommands: ['seo crawl <url> --json'],
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
