export type ReportPageCopy = {
  title: string
  description: string
  lead: string
}

export const reportPageCopy: Record<string, ReportPageCopy> = {
  'affected-urls': {
    title: 'Technical SEO affected URLs',
    description:
      'Find every URL affected by a technical SEO issue, inspect the crawl evidence on each page and turn one broad finding into a practical fix list.',
    lead: 'Open the URLs behind one crawl finding and see the evidence recorded on each page. Use this when a summary count is too broad to fix safely.',
  },
  'agent-readiness': {
    title: 'AI agent readiness',
    description:
      'Check Markdown alternatives, agent discovery, crawler access and identity across a content site. Find broken routes without inventing a readiness score.',
    lead: 'Check whether agents can find and read a clean machine-readable version of every public page. The report tests the content-site contract directly, then keeps unrelated API, application and commerce checks out of the failure count.',
  },
  'ai-readiness': {
    title: 'AI search readiness audit',
    description:
      'Check whether crawlers can access and use important pages in AI search. Find technical blockers without inventing a visibility or citation score.',
    lead: 'Check whether technical controls could stop important pages being crawled, indexed or shown with useful snippets. This audit covers eligibility evidence, not whether an AI product will mention or cite you.',
  },
  'ai-referrals': {
    title: 'AI referral traffic report',
    description:
      'Find visits from known AI assistants in Google Analytics, see which landing pages received them and keep missing referrers separate from confirmed traffic.',
    lead: 'See which known AI assistants sent visits recorded by Google Analytics and where those visitors landed. It measures observed referrals, not general visibility inside an assistant.',
  },
  'ai-search-scorecard': {
    title: 'AI search scorecard',
    description:
      'Score crawl-based AI search readiness across access, indexability and page signals. Open every contributing check before trusting the number.',
    lead: 'Turn a fixed set of crawl checks into a comparable readiness score. The number summarises the included evidence, so it cannot predict mentions, citations or traffic.',
  },
  'audit-page': {
    title: 'SEO page audit',
    description:
      'Audit one URL for technical SEO, metadata, canonicals, schema, links and Search Console queries. See the live evidence before changing the page.',
    lead: 'Inspect one live URL before changing its content or technical setup. The audit keeps crawl evidence and returned Search Console queries together so you can see what the page actually needs.',
  },
  'audit-urls': {
    title: 'Bulk SEO audit',
    description:
      'Run the same technical SEO checks across an exact list of URLs for a release, migration or template sample without opening the crawl to the whole site.',
    lead: 'Audit a list of pages you already know about without opening the crawl to the rest of the site. This works well for launch checks, migration batches and representative template pages.',
  },
  'bing-webmaster-overview': {
    title: 'Bing Webmaster report',
    description:
      'Review bounded Bing search traffic and crawl statistics for one verified site with explicit provider coverage, row limits and partial data warnings.',
    lead: 'See what Bing reported for recent search traffic and crawl activity without fetching the site. Read the provider coverage first because this evidence describes Bing only.',
  },
  cannibalisation: {
    title: 'Keyword cannibalization report',
    description:
      'Find Search Console queries associated with competing URLs and inspect where impressions, clicks or intent may be split across several pages.',
    lead: 'Find queries that Google returned with more than one URL from your site. Use the evidence to check whether those pages compete, serve different intents or only look similar in an averaged report.',
  },
  'community-intent': {
    title: 'Community intent report',
    description:
      'Find Search Console queries with forum, review, comparison or discussion intent so your content can answer the format people are looking for.',
    lead: 'Pull out searches that sound like people want opinions, comparisons or first-hand experience. The wording is a useful content clue, but it does not prove that a forum page must rank.',
  },
  'compare-crawls': {
    title: 'SEO crawl comparison',
    description:
      'Compare two saved SEO crawls to find new, fixed and changed technical issues. Check the crawl scope before treating the difference as real or complete.',
    lead: 'See what changed between two saved crawl snapshots without fetching the site again. Check that both crawls covered a comparable part of the site before celebrating a fix or reporting a regression.',
  },
  'content-optimization': {
    title: 'Content optimization report',
    description:
      'Build a content brief from one page, its Search Console queries and the headings or topics already present. Keep every suggestion tied to demand.',
    lead: 'Use one page and its returned Search Console queries to plan a focused update. The report shows missing or weak coverage without turning every related phrase into a heading.',
  },
  'crawl-diff': {
    title: 'SEO crawl diff',
    description:
      'Repeat a limited crawl and compare it with the previous run to find technical SEO issues that appeared, changed or disappeared after a release.',
    lead: 'Run the same bounded crawl again and see which technical findings changed. This is the quick release check when you need fresh evidence rather than a comparison of two existing snapshots.',
  },
  'site-crawl': {
    title: 'Sitemap health check and technical site crawl',
    description:
      'Check sitemap URL status, redirects and access first. Run the full technical SEO crawl only when you need page content, links, metadata and affected URLs.',
    lead: 'Start with a light sitemap health pass, especially on a large or unfamiliar site. Move to the full crawl when its response evidence needs investigation or you need page-level technical checks.',
  },
  'ctr-underperformers': {
    title: 'CTR optimization report',
    description:
      'Find high-impression Search Console queries with weaker CTR than expected for their position. Review the real result before rewriting a snippet.',
    lead: 'Find titles and snippets that may be underselling pages with useful rankings. The expected CTR is a review benchmark, not a Google target or a forecast of extra clicks.',
  },
  'decaying-pages': {
    title: 'SEO content decay report',
    description:
      'Compare matched Search Console periods to find pages and queries losing clicks, impressions, position or CTR before planning a content refresh.',
    lead: 'Find pages or queries with a supported decline across two matched periods. The report shows what moved, then leaves the cause open for investigation.',
  },
  'setup-check': {
    title: 'SEO CLI setup check',
    description:
      'Check your SEO CLI login, Google permissions, OAuth client and saved project settings. Get the exact next step for each failed setup check without guessing.',
    lead: 'Run this when setup, Google sign-in or a saved project is not behaving. It checks the local pieces in order and tells you what to fix first.',
  },
  'entity-readiness': {
    title: 'Entity SEO audit',
    description:
      'Check whether schema, authorship and brand details clearly connect the people, organisation and content across your site and find conflicting signals.',
    lead: 'Review the names, authors, dates, schema and sameAs links found across the crawl. The audit can spot missing or conflicting evidence, but it cannot prove that a search engine recognised an entity.',
  },
  'explain-crawl-issue': {
    title: 'Technical SEO issue guide',
    description:
      'Look up one technical SEO crawler rule in plain English. See why it may matter, how to fix it and what to check on a live page after the change.',
    lead: 'Use this when a crawl returns a rule name that is not immediately useful. You get the maintained meaning, a practical fix and a way to verify the result on a real page.',
  },
  'geo-gaps': {
    title: 'Google AI search readiness audit',
    description:
      'Check the crawl, index, canonical and snippet controls used for Google AI search eligibility without predicting whether a page will be selected.',
    lead: 'Check the technical controls Google documents for AI search features. This audit can find access or snippet restrictions, but selection still depends on systems the page cannot observe.',
  },
  'crawl-report': {
    title: 'SEO crawl report',
    description:
      'Open a saved SEO crawl by site or report ID and inspect its coverage, issues and affected pages without fetching the site or changing the saved result.',
    lead: 'Reopen a saved crawl when you need its summary, warnings or a focused set of pages. It is faster and more consistent than crawling the site again halfway through an investigation.',
  },
  'index-coverage': {
    title: 'Google index coverage audit',
    description:
      'Compare crawl, sitemap and Search Console evidence to find page groups that need a closer Google URL Inspection check before spending limited quota.',
    lead: 'Compare what your site exposes with what Search Console returns before spending URL Inspection quota. The audit points to representative pages that deserve a direct Google check.',
  },
  'index-coverage-plan': {
    title: 'URL Inspection plan',
    description:
      'Plan a representative Google URL Inspection sample across sitemaps and page groups without spending the daily API quota or guessing which pages matter.',
    lead: 'Choose which URLs to inspect before making any API calls. The plan spreads a limited quota across useful page groups instead of burning it on the first URLs in a sitemap.',
  },
  'index-monitor': {
    title: 'Google index monitor',
    description:
      'Collect a limited set of Google URL Inspection snapshots, save them locally and keep deferred or failed pages separate from checked URLs in the report.',
    lead: 'Collect Google index snapshots within the daily URL Inspection quota and save them locally. Deferred, failed and unselected pages remain visible instead of quietly looking healthy.',
  },
  'index-watch': {
    title: 'URL Inspection monitor',
    description:
      'Compare current Google URL Inspection results with saved snapshots to find selected pages whose index status or canonical changed since the last check.',
    lead: 'Track selected URLs across repeated Google URL Inspection checks. The monitor shows observed status changes while keeping unchecked and quota-limited pages out of the conclusion.',
  },
  'internal-links': {
    title: 'Internal linking report',
    description:
      'Find pages with related search demand that may deserve an internal link to a target URL. Inspect the source page for context and intent before adding anything.',
    lead: 'Find fetched pages whose queries or content overlap with a target URL and which do not already link to it. The list gives you places to review, not permission to force a link into every page.',
  },
  'link-recovery': {
    title: 'Broken link recovery report',
    description:
      'Find broken URLs and weak redirects that still have Search Console value, then decide which pages to restore, redirect or leave alone using search evidence.',
    lead: 'Combine crawl failures with returned Search Console evidence to find broken URLs that may still matter. The report helps you choose between restoring, redirecting or deliberately leaving a URL gone.',
  },
  'crawl-history': {
    title: 'SEO crawl history',
    description:
      'List saved SEO crawls by site and date, compare their scope and choose the right local snapshot before opening its pages or comparing two runs.',
    lead: 'Find the saved crawl that matches the site, date and scope you need. This keeps an agent from loading every report or comparing snapshots that covered different parts of the site.',
  },
  'crawler-rules': {
    title: 'SEO crawler rules',
    description:
      'Browse the technical checks built into the SEO crawler and find the exact rule ID needed for plain-English guidance or affected URLs from a saved crawl.',
    lead: 'Browse the maintained rule catalog before running a crawl or when a finding needs a translation. Each rule includes the ID used by follow-up reports and commands.',
  },
  'llms-txt-audit': {
    title: 'llms.txt audit',
    description:
      'Check whether llms.txt can be fetched and parsed, whether its links work and how well it covers useful pages before you publish or update it.',
    lead: 'Audit an optional llms.txt file after you choose to publish one. The result checks the file and its linked pages without pretending that Google requires it or that it guarantees AI visibility.',
  },
  'generate-llms-txt': {
    title: 'llms.txt generator',
    description:
      'Generate an llms.txt draft from useful crawled pages, then review the selected links and wording against the saved crawl before publishing the file.',
    lead: 'Create a reviewable llms.txt draft from a saved crawl and an explicit page selection. You still decide what belongs in the file (the generator does not know your publishing priorities).',
  },
  'measure-change': {
    title: 'SEO change measurement',
    description:
      'Compare matched Search Console periods around a recorded SEO change and keep releases, demand shifts and other confounders beside the result.',
    lead: 'Measure what moved around a saved SEO change using matched Search Console windows. The report can show a useful before and after without claiming that the change caused the movement.',
  },
  'monthly-report': {
    title: 'Monthly SEO report',
    description:
      'Create a monthly SEO report from finalised Search Console data with clear comparisons, page evidence, missing data and next actions for the next month.',
    lead: 'Build a report for the latest complete calendar month instead of comparing half-finished data. It explains the main movement and keeps the pages, queries and gaps behind the summary.',
  },
  'okf-build': {
    title: 'OKF export',
    description:
      'Export crawl evidence as a limited Open Knowledge Format bundle with linked artifacts that an agent can inspect locally using a clear manifest.',
    lead: 'Turn a saved crawl into a portable OKF knowledge pack for an agent or another tool. The export keeps its manifest, source files and size limits explicit.',
  },
  'okf-validate': {
    title: 'OKF validator',
    description:
      'Validate an Open Knowledge Format pack for broken files, paths, links, citations and manifest references before an agent uses or trusts the evidence.',
    lead: 'Check an OKF knowledge pack before handing it to an agent. Broken paths and missing references are much cheaper to fix before they become confident answers.',
  },
  'page-opportunities': {
    title: 'Page SEO opportunities',
    description:
      'Compare one URL with its Search Console queries and live page evidence to find focused content, CTR and coverage opportunities before rewriting the page.',
    lead: 'Review one page against the searches already associated with it. The report turns returned demand into a short inspection list rather than a generic rewrite brief.',
  },
  'performance-audit': {
    title: 'Core Web Vitals audit',
    description:
      'Run Lighthouse for one URL, add available CrUX field data and see the Core Web Vitals evidence behind the highest-impact fixes for one page.',
    lead: 'Measure one page with local Lighthouse data and available Chrome field evidence. Lab and field results answer different questions, so the audit keeps them separate.',
  },
  'pseo-audit': {
    title: 'Programmatic SEO audit',
    description:
      'Audit programmatic SEO templates, repeated URL patterns and Search Console demand. Review representative pages before changing a whole template.',
    lead: 'Review repeated page patterns with crawl and Search Console evidence before scaling or deleting anything. One thin sample cannot condemn a template, so the audit keeps coverage and representative URLs visible.',
  },
  'query-clusters': {
    title: 'Search query clustering report',
    description:
      'Group returned Search Console queries into repeated demand themes so content gaps, templates and competing pages are easier to inspect across the site.',
    lead: 'Cluster the queries Search Console actually returned into repeated themes. Use the groups to inspect demand and page coverage, not as an automatic site architecture.',
  },
  'quick-wins': {
    title: 'SEO quick wins report',
    description:
      'Find page-one queries with useful impressions and weaker CTR evidence, then inspect the search result before changing titles, snippets or page copy.',
    lead: 'Find visible queries that may have a practical CTR opportunity without rewriting the whole page. The shortlist is fast to review, but the word quick does not make the evidence certain.',
  },
  'redirect-trace': {
    title: 'Redirect trace',
    description:
      'Follow every redirect hop from one URL to its final page and check status codes, loops, chains, canonicals and link safety before updating links.',
    lead: 'Trace one URL through every redirect instead of checking only the final response. This makes loops, long chains and a surprising destination hard to miss.',
  },
  'narrative-report': {
    title: 'Narrative SEO report',
    description:
      'Turn crawl findings into a concise narrative that explains what matters, what changed and which evidence supports the next action without hiding limits.',
    lead: 'Turn structured crawl evidence into a report a client or teammate can read. It keeps the important limits and affected pages in view instead of polishing them out of the story.',
  },
  'second-page': {
    title: 'Second page SEO report',
    description:
      'Find URLs and queries averaging positions 11 to 20, then inspect whether content, links, snippets or technical issues deserve attention on each page.',
    lead: 'Find returned page and query combinations sitting around positions 11 to 20. Average position moves around, so use the list to inspect pages rather than treating it as a fixed rank tracker.',
  },
  'segment-impact': {
    title: 'SEO segment impact report',
    description:
      'Compare Search Console movement by page, query, country or device to find which segment explains a wider gain or loss across the selected dates.',
    lead: 'Break a Search Console change into the segment that actually moved. This is useful when a property total hides one page group, country or device going in the opposite direction.',
  },
  'striking-distance': {
    title: 'Striking distance SEO report',
    description:
      'Group Search Console queries around positions 11 to 20 into focused content, snippet, internal link and template review actions for each page.',
    lead: 'Turn near-page-one query evidence into a smaller set of page-level actions. The report groups useful patterns, but it cannot promise that a change will move a result onto page one.',
  },
  'seo-to-ai-query': {
    title: 'AI search query report',
    description:
      'Turn real Search Console queries into repeatable AI monitoring prompts so assistant answers can be checked against demand your site already sees.',
    lead: 'Build AI monitoring prompts from the searches already associated with your site. This gives the monitoring a demand signal without claiming that SEO queries and assistant prompts are identical.',
  },
  'top-fixes': {
    title: 'Technical SEO priority report',
    description:
      'Rank technical SEO issues using crawl severity, affected pages and available search evidence so the next fix has a clear reason and supporting evidence.',
    lead: 'Turn a long crawl issue list into a smaller implementation queue. The ranking combines reach and available value, but you should still confirm intent on representative pages before changing a template.',
  },
  'traffic-anomaly': {
    title: 'Organic traffic drop report',
    description:
      'Find unusual Search Console movement, identify the pages and queries behind it and compare the dates with confirmed Google updates before a deeper check.',
    lead: 'Investigate an unusual organic traffic change using the property history and returned Search Console rows. The report narrows the dates and affected segments without inventing a cause.',
  },
  'update-correlation': {
    title: 'Google algorithm update checker',
    description:
      'Compare unusual Search Console traffic dates with confirmed Google ranking updates without treating a matching date as proof of what caused the change.',
    lead: 'Check whether a search change overlaps a confirmed Google ranking update window. Matching dates are useful context, but they do not prove the update caused the movement.',
  },
  'search-performance-overview': {
    title: 'SEO performance report',
    description:
      'See what changed in Search Console and which pages, queries, countries or devices explain the movement before choosing what to investigate next.',
    lead: 'Start here when clicks or impressions changed and you do not yet know why. The report breaks the movement into useful segments and points to the focused evidence worth opening next.',
  },
  'monthly-action-plan': {
    title: 'SEO action plan',
    description:
      'Turn finalised monthly Search Console evidence into a limited SEO action plan with clear priorities and the follow-up report to run for each one.',
    lead: 'Build a practical monthly work list from supported Search Console findings. Every action stays linked to the report that produced it so an agent can inspect the evidence before making a change.',
  },
  'refresh-priorities': {
    title: 'SEO priority report',
    description:
      'Combine Search Console opportunities and crawl evidence into a ranked SEO work list with the reason and supporting report behind every item.',
    lead: 'Rank a mixed list of technical and content work using the evidence already collected for the project. The score helps order the queue, but it should never hide a weak or missing input.',
  },
  'technical-watch': {
    title: 'Technical SEO monitor',
    description:
      'Run recurring crawl, index and link checks together to find technical SEO changes while keeping missing or quota-limited evidence visible on every run.',
    lead: 'Run a repeatable set of technical checks across crawl health, index snapshots and link recovery. The monitor separates a confirmed change from a page it could not check.',
  },
  'update-postmortem': {
    title: 'Google update postmortem',
    description:
      'Review Search Console winners and losers around a confirmed Google update window and keep timing evidence separate from a claim of cause in the final report.',
    lead: 'Compare pages and queries around a confirmed Google ranking update after the window has settled. The postmortem shows who moved and when, then leaves causation open for deeper review.',
  },
}
