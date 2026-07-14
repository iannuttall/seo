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

export type RuleRecommendation = 'fix' | 'review'

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
    title: 'Title may truncate on some devices',
    category: 'metadata',
    defaultSeverity: 'low',
    whyItMatters:
      'Google has no fixed title length limit, but title links are truncated to fit the available device width. Important wording placed late may not always display.',
    howToFix:
      'Review the title rather than shortening it blindly. Put the clearest page-specific wording first and remove filler only when meaning is preserved.',
    impactIfIgnored:
      'Some result layouts may truncate later words. This is a display estimate, not an indexing or ranking defect.',
    howToVerify:
      'Re-run the audit and review estimatedPixels, referencePixels, confidence, and profile. Confirm the important wording appears early.',
    agentHints: {
      evidenceFields: [
        'page.title',
        'issue.evidence.estimatedPixels',
        'issue.evidence.referencePixels',
        'issue.evidence.confidence',
        'issue.evidence.profile',
      ],
      suggestedCommands: ['seo audit-page --url <url> --json'],
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
    id: 'h1_missing',
    title: 'Missing H1',
    category: 'headings',
    defaultSeverity: 'low',
    whyItMatters:
      'A descriptive main heading helps readers and assistive technology identify the page topic and navigate its content.',
    howToFix:
      'Add one clear H1 near the top of the main content. Make it describe the specific page, not just a generic section label.',
    impactIfIgnored:
      'The visible document outline may be less clear to readers and assistive technology.',
    howToVerify:
      'Re-run the crawl and confirm an H1 describes the page’s main visible topic.',
    agentHints: {
      evidenceFields: ['page.h1', 'page.h1Count'],
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
    title: 'Canonical uses a relative URL',
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
    defaultSeverity: 'low',
    whyItMatters:
      'This crawl reached the page through a redirect. A direct redirect can be intentional. It becomes worth fixing when internal links, canonicals, or sitemap entries still point to the old URL.',
    howToFix:
      'Check why the old URL was requested. Update internal links, canonicals, and sitemap entries to the final URL when appropriate. Keep one direct 301 when the old URL must remain supported.',
    impactIfIgnored:
      'An avoidable redirect adds a request and can turn into a chain later. An intentional direct redirect needs no change.',
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
    title: 'Slow response in this crawl',
    category: 'response',
    defaultSeverity: 'low',
    whyItMatters:
      'The crawler observed a slow HTML response. One request is a diagnostic sample, not a field performance verdict, but repeated slow responses are worth investigating.',
    howToFix:
      'Repeat the check and use the performance report before changing anything. If the delay persists, check server timing, cache headers, database queries, CDN caching, and origin health.',
    impactIfIgnored:
      'Persistent slow HTML can delay users and crawlers. A one-off slow sample may be network or origin variance.',
    howToVerify:
      'Re-run the crawl and compare repeated response times. Use field data where available for a user-experience decision.',
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
      'Re-run the crawl with external checks enabled and confirm the URL no longer has a confirmed-broken externalLinkChecks result.',
  },
  {
    id: 'orphan_page',
    title: 'No observed internal links',
    category: 'links',
    defaultSeverity: 'low',
    whyItMatters:
      'This crawl did not find an internal link to the page. That is worth checking, but a partial crawl cannot prove that the page is a true sitewide orphan.',
    howToFix:
      'Check the page in a complete crawl and in the sitemap. If it is meant to be discovered, add a relevant link from a hub, navigation path, related page, or template.',
    impactIfIgnored:
      'A genuinely unlinked page can be hard for users and crawlers to find. A page omitted by the crawl needs no change yet.',
    howToVerify:
      'Re-run a complete crawl from the same site entry point and confirm an observed internal link reaches the page.',
  },
  {
    id: 'deep_page',
    title: 'Deep crawl path',
    category: 'links',
    defaultSeverity: 'low',
    whyItMatters:
      'This crawl reached the page several links away from its start URL. A capped crawl or a non-homepage start URL does not prove the shortest sitewide path.',
    howToFix:
      'Check whether the page is important and whether a shorter user path makes sense. Add a link from a closer hub, category page, related content block, or navigation path only when it helps users.',
    impactIfIgnored:
      'A genuinely deep important page can be harder to reach. Treat this as a crawl-path review, not a sitewide architecture verdict.',
    howToVerify:
      'Re-run a complete crawl from the same start URL and confirm crawlDepth changed after a justified link update.',
  },
  {
    id: 'weak_internal_links_to_valuable_page',
    title: 'Review internal links to a valuable page',
    category: 'links',
    defaultSeverity: 'low',
    whyItMatters:
      'The page has observed search or analytics value but few inlinks within this crawl. It is a review cue, not proof that the page lacks enough internal authority.',
    howToFix:
      "Check the page's role and current navigation first. Add contextual links from relevant hubs, templates, or related pages only when they help users reach it.",
    impactIfIgnored:
      'A valuable page may be harder to find if it is genuinely underlinked. Do not treat the observed count as a ranking forecast.',
    howToVerify:
      'Re-run the same crawl after a justified link change and confirm the observed inlink count changed.',
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
    title: 'No canonical declared',
    category: 'canonical',
    defaultSeverity: 'low',
    whyItMatters:
      'The page did not declare a canonical. That is often fine for a unique URL. It matters when parameter, protocol, pagination, or duplicate-content variants need a preferred URL.',
    howToFix:
      'First check whether equivalent URL variants exist. Add a self-referencing canonical only when the site uses canonical tags as part of a deliberate duplicate-URL strategy.',
    impactIfIgnored:
      'A unique page may need no action. If duplicate variants exist, search engines can choose a different preferred URL.',
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
    id: 'query_coverage_missing',
    title: 'Review top-query text coverage',
    category: 'content',
    defaultSeverity: 'low',
    whyItMatters:
      'The top reported query has terms that were not found in the title, description, H1, or retained content sample. Exact terms alone do not prove relevance, and the sample cannot assess every section or useful synonym.',
    howToFix:
      'Read the page and the search results before changing copy. Add or clarify wording only when it makes the page answer the query better. Do not force exact terms into a page that already serves the intent.',
    impactIfIgnored:
      'Use this as a review prompt. It does not predict rankings, clicks, or a need to rewrite the page.',
    howToVerify:
      'Re-run the crawl with the same GSC property and review the query, sampled text, and any deliberate wording changes together.',
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
    title: 'Images lack alt attributes',
    category: 'images',
    defaultSeverity: 'medium',
    whyItMatters:
      'An image with no alt attribute gives screen readers no declared text alternative. A deliberately empty alt attribute is valid for decorative images and is not included here.',
    howToFix:
      'Add concise alt text to meaningful images that currently have no alt attribute. Keep alt="" on decorative images.',
    impactIfIgnored:
      'People using screen readers may miss the purpose of a meaningful image, and search engines have less image context.',
    howToVerify:
      'Re-run the crawl and confirm imagesMissingAlt is zero. Decorative images can keep an empty alt attribute.',
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
    title: 'Malformed hreflang values',
    category: 'international',
    defaultSeverity: 'low',
    whyItMatters:
      'These hreflang values do not match the basic language or language-region shape. This check does not validate every officially supported language or region code.',
    howToFix:
      'Use a supported language or language-region code such as en, en-gb, fr-ca, or x-default. Check the current Google hreflang documentation before changing a locale set.',
    impactIfIgnored:
      'Search engines may ignore malformed annotations and show a less relevant regional page.',
    howToVerify:
      'Re-run the crawl and confirm no hreflang values are marked malformed. Validate the full locale set against Google documentation.',
    agentHints: {
      evidenceFields: ['page.hreflang', 'issue.evidence.malformed'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
  },
  {
    id: 'hreflang_duplicate',
    title: 'Repeated hreflang values',
    category: 'international',
    defaultSeverity: 'low',
    whyItMatters:
      'Repeated hreflang declarations make a locale set harder to review. They only conflict when the same language code points to different URLs.',
    howToFix:
      'Keep one hreflang declaration per language code. If repeated codes point to different URLs, decide which page is the intended locale target.',
    impactIfIgnored:
      'Conflicting duplicate targets may be ignored. Identical repeats are usually cleanup work, not a search emergency.',
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
      'A page that declares hreflang should include an alternate that points back to its own final URL. An x-default entry does not replace that self reference.',
    howToFix:
      "Add one hreflang entry that points to this page's final URL. Keep x-default as an additional fallback only where it is useful.",
    impactIfIgnored:
      'Search engines may treat the hreflang set as incomplete and show a less relevant language variant.',
    howToVerify:
      'Re-run the crawl and confirm one hreflang href matches the fetched final URL.',
    agentHints: {
      evidenceFields: ['page.lang', 'page.hreflang'],
      suggestedCommands: ['seo crawl <url> --json'],
    },
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
      'Consumers cannot reliably read the invalid block, and Google cannot use unreadable markup for supported Search features.',
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
    title: 'No Twitter card declared',
    category: 'social',
    defaultSeverity: 'low',
    whyItMatters:
      'A Twitter card tells X which preview format to use. X can sometimes fall back to Open Graph metadata, so this is a sharing observation, not a search issue.',
    howToFix:
      'Add twitter:card and matching metadata only when you need a specific X preview. Keep Open Graph metadata accurate either way.',
    impactIfIgnored:
      'X may use fallback metadata or a simple link preview. Organic rankings are not affected.',
    howToVerify:
      'Re-run the crawl and confirm twitterCard is present if a specific X preview is required.',
  },
] as const satisfies readonly RuleDefinition[]

export type RuleId = (typeof RULE_DEFINITIONS)[number]['id']
type RawRuleInfo = (typeof RULE_DEFINITIONS)[number]
export type RuleInfo = RawRuleInfo & {
  recommendation: RuleRecommendation
}
export type RuleCategory = RuleDefinition['category']
export type RuleSeverity = RuleDefinition['defaultSeverity']

const RULE_RECOMMENDATIONS: Partial<Record<RuleId, RuleRecommendation>> = {
  title_too_wide: 'review',
  canonical_missing: 'review',
  canonical_multiple: 'review',
  canonical_mismatch: 'review',
  canonical_non_absolute: 'review',
  canonicalized_page: 'review',
  noindex: 'review',
  nofollow: 'review',
  x_robots_noindex: 'review',
  robots_blocked: 'review',
  orphan_page: 'review',
  redirected_url: 'review',
  slow_response: 'review',
  image_oversized_candidate: 'review',
  hsts_missing: 'review',
  og_title_missing: 'review',
  og_description_missing: 'review',
  og_image_missing: 'review',
  twitter_card_missing: 'review',
}

const RULES_BY_ID = new Map<string, RuleInfo>(
  RULE_DEFINITIONS.map((rule) => [
    rule.id,
    {
      ...rule,
      recommendation: RULE_RECOMMENDATIONS[rule.id] ?? 'fix',
    } as RuleInfo,
  ]),
)

export function listRules(): RuleInfo[] {
  return [...RULES_BY_ID.values()]
}

export function explainRule(ruleId: string): RuleInfo | undefined {
  return RULES_BY_ID.get(ruleId)
}

export function recommendationForRule(ruleId: string): RuleRecommendation {
  return explainRule(ruleId)?.recommendation ?? 'fix'
}

export function hasRule(ruleId: string): ruleId is RuleId {
  return RULES_BY_ID.has(ruleId)
}
