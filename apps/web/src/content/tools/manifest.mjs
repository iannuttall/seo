export const tools = [
  {
    id: 'google-algorithm-update-checker',
    path: '/tools/google-algorithm-update-checker',
    title: 'Google algorithm update checker',
    action: 'Open the Google algorithm update checker',
    description:
      'See every Google ranking update on a timeline, then add your Search Console clicks to check whether a drop lines up with one.',
    kind: 'browser',
  },
  {
    id: 'competitor-keyword-research',
    path: '/tools/competitor-keyword-research',
    title: 'Competitor keyword research',
    action: 'Open competitor keyword research',
    description:
      'See the keywords a competitor ranks for, or the sites that compete with any domain.',
    kind: 'protected',
  },
  {
    id: 'monthly-seo-report',
    path: '/tools/monthly-seo-report',
    title: 'Monthly SEO report',
    action: 'Build a monthly SEO report',
    description:
      'Turn a Search Console export into a month-on-month report, then download it as HTML or Markdown.',
    kind: 'browser',
  },
  {
    id: 'serp-checker',
    path: '/tools/serp-checker',
    title: 'SERP checker',
    action: 'Open the SERP checker',
    description:
      'See who ranks in Google for a keyword right now, and where your own domain sits.',
    kind: 'protected',
  },
  {
    id: 'domain-age-checker',
    path: '/tools/domain-age-checker',
    title: 'Domain age checker',
    action: 'Open the domain age checker',
    description:
      'See when a domain was registered, when it expires and who its registrar is, read from the registry.',
    kind: 'worker',
  },
  {
    id: 'llms-txt-generator',
    path: '/tools/llms-txt-generator',
    title: 'llms.txt generator',
    action: 'Open the llms.txt generator',
    description:
      'Create an llms.txt file from a sitemap or your own page list, then copy or download it.',
    kind: 'browser',
  },
  {
    id: 'llms-txt-validator',
    path: '/tools/llms-txt-validator',
    title: 'llms.txt validator',
    action: 'Open the llms.txt validator',
    description:
      'Check a published, pasted, or uploaded llms.txt file for formatting and link problems.',
    kind: 'hybrid',
  },
  {
    id: 'server-log-analyzer',
    path: '/tools/server-log-analyzer',
    title: 'SEO log file analyzer',
    action: 'Open the SEO log file analyzer',
    description:
      'Find Googlebot, Bingbot, and AI crawler requests in your server logs, then download the results.',
    kind: 'browser',
  },
  {
    id: 'sitemap-extractor',
    path: '/tools/sitemap-extractor',
    title: 'Sitemap URL extractor',
    action: 'Open the sitemap URL extractor',
    description:
      'Extract every URL from an XML sitemap or sitemap index, then filter and download the list.',
    kind: 'worker',
  },
  {
    id: 'spam-score-checker',
    path: '/tools/spam-score-checker',
    title: 'Spam score checker',
    action: 'Open the spam score checker',
    description: 'Check the spam score for a domain or page URL.',
    kind: 'protected',
  },
  {
    id: 'domain-rating-checker',
    path: '/tools/domain-rating-checker',
    title: 'Domain Rating checker',
    action: 'Open the Domain Rating checker',
    description: 'Check Domain Rating by Ahrefs for any website.',
    kind: 'protected',
  },
  {
    id: 'website-traffic-checker',
    path: '/tools/website-traffic-checker',
    title: 'Website traffic checker',
    action: 'Open the website traffic checker',
    description:
      "Estimate a website's monthly organic traffic, ranking keywords, and position changes by country.",
    kind: 'protected',
  },
  {
    id: 'favicon-checker',
    path: '/tools/favicon-checker',
    title: 'Favicon checker',
    action: 'Open the favicon checker',
    description:
      "Find a website's favicon files, preview them, and check where they are used.",
    kind: 'worker',
  },
  {
    id: 'word-combiner',
    path: '/tools/word-combiner',
    title: 'Word combiner',
    action: 'Open the word combiner',
    description:
      'Combine up to five word or keyword lists, filter the results, and download the combinations.',
    kind: 'browser',
  },
  {
    id: 'sitemap-validator',
    path: '/tools/sitemap-validator',
    title: 'XML sitemap validator',
    action: 'Open the XML sitemap validator',
    description:
      'Check a pasted, uploaded, or published XML sitemap for errors.',
    kind: 'hybrid',
  },
  {
    id: 'robots-txt-validator',
    path: '/tools/robots-txt-validator',
    title: 'robots.txt validator and tester',
    action: 'Open the robots.txt validator',
    description:
      'Check a robots.txt file for errors and test whether specific crawler URLs are allowed or blocked.',
    kind: 'hybrid',
  },
  {
    id: 'schema-markup-generator',
    path: '/tools/schema-markup-generator',
    title: 'Schema markup generator',
    action: 'Open the schema markup generator',
    description:
      'Create JSON-LD structured data for fourteen common page and entity types and copy the finished script.',
    kind: 'browser',
  },
  {
    id: 'schema-markup-validator',
    path: '/tools/schema-markup-validator',
    title: 'Schema markup validator',
    action: 'Open the schema markup validator',
    description:
      'Check pasted JSON-LD or HTML for syntax errors and missing properties in supported profiles.',
    kind: 'browser',
  },
  {
    id: 'hreflang-generator',
    path: '/tools/hreflang-generator',
    title: 'Hreflang generator',
    action: 'Open the hreflang generator',
    description:
      'Generate reciprocal HTML tags, an HTTP Link header, or XML sitemap entries for localized pages.',
    kind: 'browser',
  },
  {
    id: 'serp-preview',
    path: '/tools/serp-preview',
    title: 'SERP preview',
    action: 'Open the SERP preview',
    description:
      'Preview title and meta description width on desktop or mobile, then copy the finished HTML tags.',
    kind: 'browser',
  },
  {
    id: 'canonical-checker',
    path: '/tools/canonical-checker',
    title: 'Canonical tag checker',
    action: 'Open the canonical tag checker',
    description:
      'Inspect pasted HTML for missing, invalid, multiple, relative, or cross-site canonical links.',
    kind: 'browser',
  },
]

export const toolPaths = tools.map((tool) => tool.path)
