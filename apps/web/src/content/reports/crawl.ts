import type { ReportEditorial } from './types'

export const crawlReports = [
  {
    id: 'affected-urls',
    name: 'Affected URLs',
    category: 'crawl',
    summary:
      'Pull the exact URLs behind a crawl finding so a summary count becomes a practical review or fix queue.',
    question:
      'Which crawled URLs are affected by this rule, category, or severity?',
    useWhen: [
      'A crawl summary has identified a pattern and you need the limited URL inventory.',
      'An agent needs evidence for a targeted follow-up rather than the whole crawl payload.',
    ],
    avoidWhen: [
      'No crawl exists yet or the crawl scope did not include the pages you care about.',
    ],
    evidence: [
      'Issue instances stored in a saved or freshly produced crawl report.',
    ],
    methodology: [
      'Filters the report by explicit rule, category, or severity and returns a stable limited URL list.',
    ],
    exampleParams: {
      reportId: 'crawl_example_20260710',
      ruleId: 'missing_title',
      severity: 'high',
      limit: 50,
    },
    interpretation: [
      'Confirm the rule meaning and page intent before bulk changes. Repeated URLs can reveal a template problem, but the report does not prove one shared cause.',
    ],
    caveats: [
      'The result is limited by the original crawl and the requested output limit.',
    ],
    nextSteps: [
      'Use explain issue for the rule guidance.',
      'Audit representative URLs and recrawl after the fix.',
    ],
    related: ['explain-crawl-issue', 'audit-page', 'compare-crawls'],
    sources: [],
  },
  {
    id: 'agent-readiness',
    name: 'AI agent readiness',
    category: 'crawl',
    summary:
      'Check whether a content site gives agents stable Markdown alternatives, useful discovery files, clear identity, and predictable access.',
    question:
      'Can an agent find, fetch, and read the public content without losing the document structure or guessing which routes exist?',
    useWhen: [
      'A documentation, publishing, or content site serves machine-readable versions of its pages.',
      'You want one focused check for Markdown delivery, agent discovery, access, and identity.',
    ],
    avoidWhen: [
      'You need an AI mention, citation, referral, ranking, or selection measurement.',
      'The main job is testing a public API, interactive agent application, or commerce flow.',
    ],
    evidence: [
      'Public HTML pages, Markdown alternatives, HTTP content negotiation, route manifests, Agent Skills, llms.txt, crawler policies, and structured identity.',
    ],
    methodology: [
      'Selects the content profile, checks each public representation and discovery surface, and marks unrelated capability profiles as not applicable rather than failed.',
    ],
    exampleParams: {
      url: 'https://example.com/',
      maxPages: 100,
    },
    interpretation: [
      'Start with failed routes and mismatched bytes. A missing optional file can be useful context, but it is not a search defect or proof that agents cannot use the site.',
    ],
    caveats: [
      'This report has no aggregate score. A clean result cannot prove that an AI service fetched, used, mentioned, cited, ranked, or selected a page.',
    ],
    nextSteps: [
      'Fix shared generation or delivery problems before patching individual Markdown files.',
      'Repeat the same public route scope after deployment and compare the affected checks.',
    ],
    related: [
      'ai-readiness',
      'llms-txt-audit',
      'entity-readiness',
      'site-crawl',
    ],
    sources: [],
  },
  {
    id: 'ai-readiness',
    name: 'AI search readiness',
    category: 'crawl',
    summary:
      'Check technical access, indexability, snippet controls, page structure, and optional agent resources without inventing an AI visibility score.',
    question:
      'Does the crawl show technical restrictions or missing evidence worth reviewing for AI search?',
    useWhen: [
      'You need a technical readiness review grounded in a crawl.',
      'You want access and content observations kept separate from selection claims.',
    ],
    avoidWhen: [
      'You need proof of citations, rankings, indexing, or inclusion in an AI answer.',
    ],
    evidence: [
      'Crawl responses, robots and snippet directives, canonicals, page structure, structured data, bot policies, and optional resource files.',
    ],
    methodology: [
      'Evaluates each evidence group independently and returns unknown when the crawl cannot support a pass or failure.',
    ],
    exampleParams: { reportId: 'crawl_example_20260710' },
    interpretation: [
      'Prioritise hard conflicts with publisher intent. Treat semantic structure and optional files as observations, not Google requirements.',
    ],
    caveats: [
      'Technical eligibility never guarantees indexing, selection, citation, visibility, or traffic.',
    ],
    nextSteps: [
      'Use geo gaps for Google-specific access and snippet controls.',
      'Use AI referrals for observed referral sessions.',
    ],
    related: ['geo-gaps', 'entity-readiness', 'ai-referrals'],
    sources: ['ai-features', 'robots', 'robots-meta'],
  },
  {
    id: 'audit-urls',
    name: 'Audit a URL list',
    category: 'crawl',
    summary:
      'Run the same technical checks across an explicit set of URLs without opening the crawl to the whole site.',
    question:
      'What technical evidence and repeated issues appear across these chosen URLs?',
    useWhen: [
      'A release, template, migration batch, or priority list needs a limited audit.',
      'The exact URL set matters more than site discovery.',
    ],
    avoidWhen: [
      'You need to discover unknown pages or understand the internal link graph.',
    ],
    evidence: [
      'Fetched responses, metadata, directives, links, headings, and structured data for the supplied URLs.',
    ],
    methodology: [
      'Fetches the explicit list within configured bounds, runs the shared crawl rules, and records failures separately from page findings.',
    ],
    exampleParams: {
      urls: ['https://example.com/', 'https://example.com/pricing'],
      includeIssues: true,
      saveReport: true,
    },
    interpretation: [
      'Separate fetch failures from valid-page findings. Look for repeated evidence across the chosen template without claiming sitewide coverage.',
    ],
    caveats: [
      'The report says nothing about URLs outside the supplied list. Client-rendered content may require JavaScript mode.',
    ],
    nextSteps: [
      'Inspect affected URLs for a repeated rule.',
      'Save and compare the report after the release is fixed.',
    ],
    related: ['affected-urls', 'compare-crawls', 'audit-page'],
    sources: ['javascript', 'canonical', 'structured-data'],
  },
  {
    id: 'compare-crawls',
    name: 'Compare crawl reports',
    category: 'crawl',
    summary:
      'See which pages and issues appeared, disappeared, or changed between two saved crawls.',
    question: 'What changed between these two crawl snapshots?',
    useWhen: [
      'You need to verify a deployment, migration, or technical cleanup.',
      'Both crawls used comparable scope and settings.',
    ],
    avoidWhen: [
      'The crawl scopes differ so much that added and removed pages mostly describe configuration changes.',
    ],
    evidence: [
      'Saved page, issue, rule, and score observations from the before and after crawl reports.',
    ],
    methodology: [
      'Matches stable page and issue identities, separates additions, removals, regressions, recoveries, and unchanged evidence.',
    ],
    exampleParams: {
      after: 'latest',
      before: 'previous',
      site: 'sc-domain:example.com',
    },
    interpretation: [
      'Check crawl scope and failures first. A disappeared issue is a recovery only when the page remained testable in the after crawl.',
    ],
    caveats: [
      'A missing page, blocked fetch, or changed crawl limit can make an issue disappear without being fixed.',
    ],
    nextSteps: [
      'Audit representative regressions directly.',
      'Run affected URLs when a changed rule spans many pages.',
    ],
    related: ['affected-urls', 'audit-page', 'crawl-diff'],
    sources: [],
  },
  {
    id: 'site-crawl',
    name: 'Site crawl',
    category: 'crawl',
    summary:
      'Map a limited part of the site and turn technical evidence into a reusable baseline for follow-up work.',
    question:
      'What can the crawler discover and verify across this site scope?',
    useWhen: [
      'You need a technical baseline, issue inventory, or saved crawl for focused follow-ups.',
      'The start URL, page limit, and depth are appropriate for the site.',
    ],
    avoidWhen: [
      'You need proof of Google indexing or complete coverage beyond the configured crawl boundary.',
    ],
    evidence: [
      'Fetched responses, redirects, directives, canonicals, metadata, headings, links, structured data, and crawl discovery paths.',
    ],
    methodology: [
      'Crawls same-origin pages within explicit depth and page bounds, applies shared rules, and preserves skipped, blocked, invalid, and partial states.',
    ],
    exampleParams: {
      url: 'https://example.com/',
      maxPages: 100,
      maxDepth: 3,
      saveReport: true,
    },
    interpretation: [
      'Read coverage, limits, failures, and robots evidence before issue counts. Prioritise conflicts that affect important pages and match publisher intent.',
    ],
    caveats: [
      'A local crawl is not Googlebot and cannot prove indexing. Pages outside discovery or limits remain untested.',
    ],
    nextSteps: [
      'Use top fixes for a compact action queue.',
      'Use affected URLs or a focused readiness report without rerunning the crawl.',
    ],
    related: ['top-fixes', 'affected-urls', 'compare-crawls'],
    sources: ['robots', 'canonical', 'crawlable-links', 'javascript'],
  },
  {
    id: 'entity-readiness',
    name: 'Entity evidence',
    category: 'crawl',
    summary:
      'Review naming, authorship, date, schema, and sameAs evidence without claiming that a search engine recognised an entity.',
    question:
      'What machine-readable and on-page entity signals were observed in this crawl?',
    useWhen: [
      'An organisation, person, or publisher needs a consistency review.',
      'You want missing or contradictory evidence separated from optional enhancements.',
    ],
    avoidWhen: [
      'You need proof of Knowledge Graph inclusion, authority, or ranking impact.',
    ],
    evidence: [
      'Structured data, names, sameAs URLs, social profiles, author and date fields, and crawl caveats.',
    ],
    methodology: [
      'Collects observed signals, validates parseable structure, and reports consistency checks without an entity-recognition score.',
    ],
    exampleParams: { reportId: 'crawl_example_20260710' },
    interpretation: [
      'Fix factual conflicts and invalid markup. Add optional fields only when they accurately describe visible content and the real entity.',
    ],
    caveats: [
      'Valid structured data does not guarantee recognition, rich results, rankings, or inclusion in an answer.',
    ],
    nextSteps: [
      'Correct inconsistent source facts and rerun the crawl.',
      'Use AI readiness for the broader technical access review.',
    ],
    related: ['ai-readiness', 'audit-page', 'site-crawl'],
    sources: ['structured-data'],
  },
  {
    id: 'explain-crawl-issue',
    name: 'Explain a crawler issue',
    category: 'crawl',
    summary:
      'Turn a crawler rule id into plain-English meaning, safe fixes, and a verification plan.',
    question: 'What does this crawler rule mean and how should it be checked?',
    useWhen: [
      'A crawl result contains a rule id that needs explanation before action.',
      'An agent needs the canonical guidance for a known rule.',
    ],
    avoidWhen: [
      'You need to know whether a specific URL is affected. This explains the rule, not the page evidence.',
    ],
    evidence: [
      'The versioned crawler rule catalog and its severity, category, rationale, remediation, and verification metadata.',
    ],
    methodology: [
      'Looks up one exact rule id and returns its maintained guidance without rerunning a crawl.',
    ],
    exampleParams: { ruleId: 'missing_title' },
    interpretation: [
      'Use the explanation to review the affected page in context. Severity helps triage, but page purpose and intent decide whether a change is appropriate.',
    ],
    caveats: [
      'Rule guidance cannot replace the URL evidence or turn a heuristic into a search-engine requirement.',
    ],
    nextSteps: [
      'Fetch the affected URL list for this rule.',
      'Audit representative pages and verify the change with a fresh crawl.',
    ],
    related: ['affected-urls', 'audit-page', 'crawler-rules'],
    sources: [],
  },
  {
    id: 'geo-gaps',
    name: 'Google AI search controls',
    category: 'crawl',
    summary:
      'Check the crawl, indexability, and snippet controls Google says also govern eligibility for its AI search features.',
    question:
      'Does the observed site configuration restrict Google’s access or use of content in AI search features?',
    useWhen: [
      'You need a Google-specific eligibility review grounded in published controls.',
      'You want optional page observations kept separate from access restrictions.',
    ],
    avoidWhen: [
      'You need a visibility score, prompt rank, citation forecast, or guarantee of selection.',
    ],
    evidence: [
      'Crawl access, indexability, canonical and snippet directives, plus limited page observations.',
    ],
    methodology: [
      'Maps observed controls to Google’s published AI-feature guidance and reports unknown when evidence is missing.',
    ],
    exampleParams: { reportId: 'crawl_example_20260710', limit: 25 },
    interpretation: [
      'Fix restrictions only when they conflict with publisher intent. No detected restriction means the technical check found none, not that selection will occur.',
    ],
    caveats: [
      'Google states that normal Search technical requirements apply and no special AI markup is required.',
    ],
    nextSteps: [
      'Use affected URLs for any restrictive rule.',
      'Use AI referrals for separate observed traffic evidence.',
    ],
    related: ['affected-urls', 'ai-readiness', 'ai-referrals'],
    sources: ['ai-features', 'robots', 'robots-meta'],
  },
  {
    id: 'crawl-report',
    name: 'Get a saved crawl report',
    category: 'crawl',
    summary:
      'Retrieve one saved crawl snapshot in compact form before asking for its large page or issue inventories.',
    question:
      'What does this saved crawl contain and is it the right evidence for the next step?',
    useWhen: [
      'An agent has a report id or needs the latest saved crawl for a site.',
      'You want report metadata and summary before loading details.',
    ],
    avoidWhen: [
      'You need current evidence and the saved crawl is stale for the decision.',
    ],
    evidence: [
      'Locally saved crawl metadata, summary, coverage, caveats, and optional limited details.',
    ],
    methodology: [
      'Resolves an exact report id or latest matching report, then keeps raw inventories opt-in.',
    ],
    exampleParams: { id: 'crawl_example_20260710', includeIssues: true },
    interpretation: [
      'Check creation time, scope, limits, and failures before reusing the evidence. Load pages or issues only when the next task needs them.',
    ],
    caveats: [
      'A saved crawl is a snapshot. It does not update when the site changes.',
    ],
    nextSteps: [
      'Run a focused report against the saved id.',
      'Start a new crawl when freshness changes the decision.',
    ],
    related: ['crawl-history', 'affected-urls', 'site-crawl'],
    sources: [],
  },
  {
    id: 'crawl-history',
    name: 'List saved crawl reports',
    category: 'crawl',
    summary:
      'Find the local crawl snapshot you need without opening every report.',
    question: 'Which saved crawl reports are available for this site?',
    useWhen: [
      'You need an id for a comparison or focused follow-up.',
      'Several local crawl snapshots exist.',
    ],
    avoidWhen: [
      'You need current crawl evidence rather than local report metadata.',
    ],
    evidence: [
      'Locally stored crawl ids, sites, creation times, scope, and summary metadata.',
    ],
    methodology: [
      'Filters saved metadata by site and returns a stable, limited list.',
    ],
    exampleParams: { site: 'sc-domain:example.com', limit: 10 },
    interpretation: [
      'Choose reports with comparable scope and the right date. Newest is not always the right baseline.',
    ],
    caveats: [
      'The list does not inspect the live site or prove that a saved report is complete.',
    ],
    nextSteps: [
      'Open the chosen report.',
      'Compare two compatible snapshots when you need change evidence.',
    ],
    related: ['crawl-report', 'compare-crawls'],
    sources: [],
  },
  {
    id: 'crawler-rules',
    name: 'List crawler rules',
    category: 'crawl',
    summary:
      'Browse the maintained technical checks by category before choosing a rule-specific follow-up.',
    question: 'Which crawler rule ids and guidance are available?',
    useWhen: [
      'An agent needs a valid rule id.',
      'You want to see which checks exist in a technical category.',
    ],
    avoidWhen: [
      'You need results for a site. The rule catalog contains definitions, not crawl evidence.',
    ],
    evidence: ['The versioned local crawler rule catalog.'],
    methodology: [
      'Returns stable rule ids and compact guidance metadata, optionally filtered by category.',
    ],
    exampleParams: { category: 'metadata' },
    interpretation: [
      'Choose a rule by its meaning, then inspect evidence from a crawl. Do not treat catalog presence as a site defect.',
    ],
    caveats: [
      'Some rules are observations or heuristics rather than universal search requirements.',
    ],
    nextSteps: [
      'Explain the selected rule.',
      'Fetch affected URLs from a saved crawl.',
    ],
    related: ['explain-crawl-issue', 'affected-urls'],
    sources: [],
  },
  {
    id: 'llms-txt-audit',
    name: 'llms.txt audit',
    category: 'crawl',
    summary:
      'Inspect an optional llms.txt file and candidate source pages without calling its absence an SEO defect.',
    question:
      'Is an llms.txt file present, fetchable, and consistent with useful crawl evidence?',
    useWhen: [
      'A publisher has chosen to maintain llms.txt or wants to assess the optional format.',
      'You need candidate pages for a draft.',
    ],
    avoidWhen: [
      'You need a Google ranking or AI eligibility requirement. Google does not require llms.txt.',
    ],
    evidence: [
      'Observed llms.txt response, parsed entries, crawl candidates, and current Google AI-feature guidance.',
    ],
    methodology: [
      'Checks the optional file independently from normal crawl and indexing controls.',
    ],
    exampleParams: { reportId: 'crawl_example_20260710' },
    interpretation: [
      'Fix broken or misleading content if you intentionally publish the file. Leave it absent if it adds no maintained value.',
    ],
    caveats: [
      'Presence does not prove that any crawler reads the file or that an AI product will use its links.',
    ],
    nextSteps: [
      'Generate a draft only if someone will own it.',
      'Keep normal crawl, index, and snippet controls correct.',
    ],
    related: ['generate-llms-txt', 'ai-readiness', 'geo-gaps'],
    sources: ['ai-features'],
  },
  {
    id: 'generate-llms-txt',
    name: 'Generate llms.txt',
    category: 'crawl',
    summary:
      'Create a limited llms.txt draft from crawl evidence for a publisher who has decided to maintain the optional file.',
    question:
      'What would a concise llms.txt draft look like for these selected site pages?',
    useWhen: [
      'The optional format is a deliberate publishing choice.',
      'A saved crawl provides a reviewable page inventory.',
    ],
    avoidWhen: [
      'You expect the file to create rankings, indexing, citations, or AI visibility.',
    ],
    evidence: [
      'Saved crawl URLs, titles, descriptions, exclusions, output limit, and token budget.',
    ],
    methodology: [
      'Selects limited candidate pages consistently and returns draft content plus generation metadata.',
    ],
    exampleParams: {
      reportId: 'crawl_example_20260710',
      maxUrls: 50,
      tokenBudget: 4000,
      exclude: ['/account/*', '/search'],
    },
    interpretation: [
      'Review every selected page and description. Publish only accurate, stable destinations that help a machine or person find core material.',
    ],
    caveats: [
      'The format is optional and has no guaranteed support or search benefit. Generated content still needs human ownership.',
    ],
    nextSteps: [
      'Validate the draft against the live site.',
      'Re-audit after publishing or changing important URLs.',
    ],
    related: ['llms-txt-audit', 'ai-readiness'],
    sources: ['ai-features'],
  },
  {
    id: 'okf-build',
    name: 'Build an OKF knowledge manifest',
    category: 'crawl',
    summary:
      'Turn a saved crawl into a compact, cited site knowledge manifest for an agent to inspect locally.',
    question:
      'Which crawled pages and relationships should form a limited site knowledge pack?',
    useWhen: [
      'An agent needs a local, reviewable site map with source citations.',
      'The crawl is current enough for the task.',
    ],
    avoidWhen: [
      'You need a search-engine requirement or a replacement for the live pages.',
    ],
    evidence: [
      'Crawl URLs, page metadata, internal links, extracted concepts, selection limits, and caveats.',
    ],
    methodology: [
      'Selects concepts and pages within explicit limits, emits a manifest, and can include limited Markdown files.',
    ],
    exampleParams: {
      reportId: 'crawl_example_20260710',
      maxConcepts: 25,
      includeFiles: true,
      title: 'Example site knowledge',
    },
    interpretation: [
      'Treat the output as a derived local artifact. Follow citations back to the live page before using a claim.',
    ],
    caveats: [
      'The pack inherits the crawl scope, extraction limits, and freshness of its source report.',
    ],
    nextSteps: [
      'Validate the generated files.',
      'Rebuild after meaningful information architecture changes.',
    ],
    related: ['okf-validate', 'site-crawl'],
    sources: [],
  },
  {
    id: 'okf-validate',
    name: 'Validate OKF files',
    category: 'crawl',
    summary:
      'Check an agent-supplied OKF file set for structural and reference problems before another tool relies on it.',
    question: 'Does this OKF file set satisfy the expected local contract?',
    useWhen: [
      'Files were generated or edited and need validation.',
      'An automation depends on predictable paths and metadata.',
    ],
    avoidWhen: [
      'You need to verify the truth of every source-page claim. Structural validation cannot do that.',
    ],
    evidence: [
      'The supplied file paths, frontmatter, headings, links, citations, and required manifest structure.',
    ],
    methodology: [
      'Parses the limited file set and returns repeatable errors and warnings for the supported format.',
    ],
    exampleParams: {
      files: [
        { path: 'index.md', content: '# Example knowledge' },
        { path: 'caveats.md', content: '# Caveats' },
      ],
    },
    interpretation: [
      'Fix errors before use. Review warnings in context, then check cited live pages for factual accuracy.',
    ],
    caveats: [
      'A valid file set can still contain stale, incomplete, or incorrect content.',
    ],
    nextSteps: [
      'Correct invalid files and rerun validation.',
      'Rebuild from a current crawl when source details is unclear.',
    ],
    related: ['okf-build', 'crawl-report'],
    sources: [],
  },
  {
    id: 'top-fixes',
    name: 'Top technical fixes',
    category: 'crawl',
    summary:
      'Reduce a crawl to a small technical fix queue, with the rule and affected evidence still attached.',
    question: 'Which supported technical findings should be reviewed first?',
    useWhen: [
      'A broad crawl is too large to act on directly.',
      'You need a limited queue by category or severity.',
    ],
    avoidWhen: [
      'You want an automatic change list that ignores page intent or business priority.',
    ],
    evidence: [
      'Crawl issue instances, rule metadata, affected URL counts, severity, and selected category.',
    ],
    methodology: [
      'Ranks eligible issue groups consistently and returns a compact limit without discarding source references.',
    ],
    exampleParams: {
      reportId: 'crawl_example_20260710',
      category: 'metadata',
      limit: 5,
    },
    interpretation: [
      'Validate the first item on representative pages. A lower-severity repeated template issue may deserve attention before one isolated high-severity URL.',
    ],
    caveats: [
      'The queue reflects the crawl scope and rule priorities, not business value or guaranteed search impact.',
    ],
    nextSteps: [
      'Explain the selected rule.',
      'Open its affected URLs and verify a fix with another crawl.',
    ],
    related: ['explain-crawl-issue', 'affected-urls', 'compare-crawls'],
    sources: [],
  },
] as const satisfies readonly ReportEditorial[]
