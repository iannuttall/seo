export const crawlerWorkflowMarkdown = `# SEO crawler MCP workflows

Use these workflows when an agent needs technical SEO and GEO crawl data without dumping raw JSON on a human.

## Default site audit

1. Call \`seo_crawl_site\` with the start \`url\`, optional GSC \`site\`, optional \`ga4PropertyId\`, and a bounded \`maxPages\`.
2. Set \`saveReport: true\` when the user may ask follow-up questions. Saved reports let later tools slice the same crawl without re-crawling.
3. Read \`summary\`, \`topFixes\`, \`warnings\`, and \`caveats\` first. Do not request \`includePages\` or \`includeIssues\` unless the user needs raw data.
4. For each top fix, call \`seo_explain_issue\` for plain-English guidance and \`seo_affected_urls\` for exact URLs.
5. Return a concise human report: headline, scores, top fixes, affected URLs, caveats, and verification commands.

## Implementation queue

1. Run \`seo_crawl_site\` with \`saveReport: true\`.
2. Call \`seo_top_fixes\` with the saved \`reportId\` and a practical \`limit\`.
3. For the top 3 to 5 fixes, call \`seo_affected_urls\` with \`ruleId\` and \`limit\`.
4. Convert each fix into a queue item with: rank, rule id, severity, affected count, sample URLs, action, verification command, and caveats.
5. Keep plain English in \`action\`; keep exact URLs, counts, rule ids, scores, and commands as structured data for agents.

## GEO readiness

1. Run \`seo_crawl_site\` or reuse the latest saved report.
2. Call \`seo_geo_gaps\` with \`reportId\` and a page limit.
3. Explain the major GEO rule ids with \`seo_explain_issue\`.
4. Separate content fixes from technical fixes. Important GEO fields include structured data, semantic HTML, author, date, answerable content, and \`/llms.txt\`.

## Focused URL audit

Use \`seo_audit_urls\` for a small set of explicit URLs. This is faster than a full crawl and is useful for launch gates, templates, and post-fix verification.

## Idempotency rules

- Prefer saved report ids for follow-up tools.
- Reuse \`reportId\` instead of re-crawling unless the user asks for fresh data.
- Keep \`maxPages\`, \`include\`, \`exclude\`, \`useSitemap\`, \`respectRobots\`, and \`js\` explicit when reproducibility matters.
- JSON is for agents. Human replies should summarize and prioritize, not paste full reports.
`

export const crawlerToolGuide = {
  workflows: [
    {
      id: 'site-audit',
      goal: 'Crawl a site, summarize health and GEO readiness, and produce a fix plan.',
      tools: [
        'seo_crawl_site',
        'seo_top_fixes',
        'seo_explain_issue',
        'seo_affected_urls',
      ],
    },
    {
      id: 'implementation-queue',
      goal: 'Turn crawl issues into a ranked queue with verification commands.',
      tools: [
        'seo_crawl_site',
        'seo_top_fixes',
        'seo_affected_urls',
        'seo_explain_issue',
      ],
    },
    {
      id: 'geo-readiness',
      goal: 'Find pages that are weak for AI-search and citation readiness.',
      tools: ['seo_crawl_site', 'seo_geo_gaps', 'seo_explain_issue'],
    },
    {
      id: 'focused-url-audit',
      goal: 'Audit a small set of URLs without crawling the whole site.',
      tools: ['seo_audit_urls', 'seo_explain_issue'],
    },
  ],
  tools: [
    {
      name: 'seo_crawl_site',
      useFor: 'Full-site technical SEO and GEO crawl.',
      outputToReadFirst: ['summary', 'topFixes', 'warnings', 'caveats'],
      followUps: ['seo_top_fixes', 'seo_affected_urls', 'seo_geo_gaps'],
    },
    {
      name: 'seo_audit_urls',
      useFor: 'Explicit URL list audit with no discovery crawl.',
      outputToReadFirst: ['summary', 'topFixes', 'warnings', 'caveats'],
      followUps: ['seo_explain_issue', 'seo_affected_urls'],
    },
    {
      name: 'seo_top_fixes',
      useFor: 'Rank grouped crawl fixes from a URL or saved report.',
      outputToReadFirst: ['topFixes'],
      followUps: ['seo_affected_urls', 'seo_explain_issue'],
    },
    {
      name: 'seo_affected_urls',
      useFor: 'Get exact URLs for a rule, category, or severity.',
      outputToReadFirst: ['affectedUrls'],
      followUps: ['seo_explain_issue'],
    },
    {
      name: 'seo_geo_gaps',
      useFor: 'List pages with AI-search readiness gaps.',
      outputToReadFirst: ['geoGaps'],
      followUps: ['seo_explain_issue'],
    },
    {
      name: 'seo_explain_issue',
      useFor:
        'Turn a rule id into plain-English why, fix, impact, and verification guidance.',
      outputToReadFirst: [
        'whyItMatters',
        'howToFix',
        'impactIfIgnored',
        'howToVerify',
      ],
      followUps: [],
    },
  ],
  responseShape: {
    human: [
      'Plain-English headline',
      'Top fixes in priority order',
      'Affected URLs and examples',
      'Caveats and skipped data',
      'Verification commands',
    ],
    agent: [
      'reportId',
      'ruleId',
      'severity',
      'score',
      'affectedUrls',
      'sampleUrls',
      'verification.command',
    ],
  },
} as const
