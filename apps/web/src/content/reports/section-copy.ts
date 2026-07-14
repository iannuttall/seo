export const reportNextStepIntros: Record<string, string> = {
  'affected-urls':
    'The URL list is ready for inspection, not bulk editing. Open representative pages, confirm that the rule conflicts with their purpose, then recrawl the same scope after the fix.',
  'ai-readiness':
    "Start with hard access, indexability or snippet conflicts that work against the publisher's intent. Keep referral traffic and assistant mentions as separate measurements because this audit cannot observe either one.",
  'ai-referrals':
    'Check the matched referrer and landing page before treating a session as useful AI traffic. Search demand and assistant visibility need their own reports because GA4 only records visits that reached the site.',
  'ai-search-scorecard':
    'Open the checks behind the weakest score group and fix only the failures supported by crawl evidence. Run the scorecard again against a comparable crawl so the before and after numbers describe the same scope.',
  'audit-page':
    "Choose the finding that affects this page's actual purpose, make one supported change and audit the URL again. A fresh page check is more useful than carrying an old crawl observation into the next decision.",
  'audit-urls':
    'Separate repeated template problems from failures that affect one URL. Fix a representative page first, then run the same bounded URL list again before changing the rest of the batch.',
  cannibalisation:
    'Compare the competing pages and the intent each one serves before consolidating anything. Merge, redirect or differentiate a page only when the returned query evidence and the live content support that choice.',
  'community-intent':
    'Review the wording of the returned queries and the result formats already serving them. Use that evidence to decide whether the page needs first-hand experience, comparison detail or a different content format.',
  'compare-crawls':
    'Confirm that both crawls covered comparable pages before calling a difference a regression or recovery. Audit representative changes directly, then use affected URLs when the same rule spans a larger group.',
  'content-optimization':
    "Choose the gaps supported by returned queries and the page's existing purpose. Update the page around a focused intent, then measure the same query and page set after enough Search Console data has arrived.",
  'crawl-diff':
    'Check that the repeated crawl used the same start URL, limits and discovery rules. Inspect new regressions on live pages and run the bounded crawl again after the release fix.',
  'site-crawl':
    'Start with the issues affecting important pages, then open the affected URLs instead of changing a template from a count alone. Save the next crawl with comparable limits so you can verify what disappeared and what remained.',
  'ctr-underperformers':
    'Inspect the live search result and query intent before rewriting a title or description. Record the change, leave the page long enough to collect comparable data and check the same query set again.',
  'decaying-pages':
    'Confirm that the decline survives a matched date and segment comparison before refreshing the page. Use the page opportunity report to choose a supported update, then measure the change against the same demand.',
  'setup-check':
    'Fix the first failed setup check because later failures may be a consequence of it. Run the setup check again after each change until the saved project and Google connection pass together.',
  'entity-readiness':
    'Correct conflicting names, authors, dates and invalid markup before adding optional fields. Recrawl the affected pages and check that the visible content and structured data now describe the same real entity.',
  'explain-crawl-issue':
    'Use the rule ID to fetch the affected URLs, then inspect representative pages in context. Apply the fix only where the rule conflicts with intent and verify it with a fresh crawl.',
  'geo-gaps':
    'Open the affected URLs for any restrictive Google access or snippet control and check whether the rule is intentional. Use AI referral data separately when you need evidence of visits rather than technical eligibility.',
  'crawl-report':
    'Check the saved crawl date, scope and failures before reusing it. Run a focused report against that snapshot when it is still relevant, or start a new crawl when freshness could change the decision.',
  'index-coverage':
    'Use the grouped evidence to choose representative URLs for Google URL Inspection. Spend the limited quota on pages that can confirm or challenge the crawl and sitemap pattern.',
  'index-coverage-plan':
    'Review the proposed sample before spending URL Inspection quota. Run the index monitor with the accepted URLs and keep deferred pages visible for a later cycle.',
  'index-monitor':
    'Inspect failed, deferred and quota-blocked URLs before reading the checked set as coverage. Save the completed snapshots, then use the watch report to compare those same pages later.',
  'index-watch':
    'Confirm each changed Google status against the saved and current inspection evidence. Audit the live URL when a canonical, response or directive could explain the movement.',
  'internal-links':
    'Open both the suggested source page and target page before adding a link. Keep the link only when it helps the reader in that exact context, then recrawl to confirm the relationship was recorded.',
  'link-recovery':
    "Inspect the broken URL's search evidence and the page you might use as its destination. Restore or redirect it only when the replacement serves the same intent, then trace the final response and links again.",
  'crawl-history':
    'Choose snapshots with the date and crawl scope needed for the decision. Open one report for a focused investigation or compare two compatible runs when you need evidence of change.',
  'crawler-rules':
    'Choose the rule by its maintained meaning rather than its severity label alone. Open the rule guidance, then inspect affected URLs from a real crawl before deciding that the site needs a change.',
  'llms-txt-audit':
    'Fix parse errors, broken links and unintended omissions in the published file, then run the audit again. Keep the result as a file-quality check because it cannot show whether an AI product used the file.',
  'generate-llms-txt':
    'Review every selected URL and description before publishing the draft. Keep only stable pages you are comfortable recommending, then audit the live file after it is available.',
  'measure-change':
    'Read the matched windows and visible confounders before attaching the movement to your change. Record what the comparison supports and keep monitoring the affected pages instead of turning one result into a causal claim.',
  'monthly-report':
    'Assign each proposed action to the page, query or crawl evidence that supports it. Keep missing sections visible and use the named follow-up report before a recommendation becomes implementation work.',
  'okf-build':
    'Validate the exported pack before another tool or agent uses it. Start from the manifest, confirm the linked artifacts are present and rebuild the pack when the source crawl changes.',
  'okf-validate':
    'Fix broken paths, missing files and invalid manifest references before using the pack. Rebuild from the source evidence when the errors show that the export itself is incomplete.',
  'page-opportunities':
    'Choose one change supported by the returned queries and the live page evidence. Update the page around its existing purpose, then compare the same page and query set after new data arrives.',
  'performance-audit':
    'Start with the highest-impact problem supported by the lab trace and test the fix on the same page and device profile. Rerun Lighthouse immediately, then wait for field data before claiming a Core Web Vitals improvement.',
  'pseo-audit':
    'Inspect representative pages from each template pattern before changing the generator. Fix shared problems at template level, recrawl the same sample and confirm that distinct pages still serve distinct intent.',
  'query-clusters':
    'Open the queries and pages inside each useful cluster before changing site structure. Treat the groups as an investigation aid, then confirm intent and page overlap with live search evidence.',
  'quick-wins':
    'Inspect the current result and page intent before changing its snippet. Record the exact title or description update and compare the same queries after a complete data window.',
  'redirect-trace':
    "Fix loops, unnecessary hops and destinations that do not match the original URL's purpose. Update internal links to the final URL and trace the path again after deployment.",
  'narrative-report':
    'Check every main claim against the linked crawl evidence before sharing the narrative. Keep affected pages, warnings and missing sections attached so the reader can inspect what supports the recommendation.',
  'second-page':
    'Audit the page and query pairs that have useful demand and a realistic content match. Choose the content, snippet, link or technical change supported by that page, then check the same pair again later.',
  'segment-impact':
    'Use the segment that explains the movement to choose a narrower investigation. Keep the rest of the property out of the conclusion until its pages, queries, country or device evidence shows the same pattern.',
  'striking-distance':
    'Group the returned queries by page and prioritise cases with clear demand and a strong intent match. Make a focused page or link change, then watch the same query group instead of the property average.',
  'seo-to-ai-query':
    'Review the generated prompts so they still represent the searches and topics you care about. Save a stable prompt set for external answer monitoring and keep any observed mentions separate from Search Console performance.',
  'top-fixes':
    'Open the affected URLs behind the highest-ranked issue and inspect representative pages before changing a template. Recrawl the same scope after the fix so the priority queue reflects fresh evidence.',
  'traffic-anomaly':
    'Confirm the affected dates, pages and queries before looking for an explanation. Use segment impact or the Google update checker to narrow the investigation without turning timing into cause.',
  'update-correlation':
    'Use the matching update window as context for the investigation, not its conclusion. Inspect the pages and queries that moved, then run a postmortem after the comparison window has settled.',
  'search-performance-overview':
    'Choose the page, query, country or device segment that explains the property-level movement. Run the narrower report for that segment before recommending a sitewide change.',
  'monthly-action-plan':
    'Open the supporting report behind each action before assigning the work. Carry unfinished or weakly supported items into the next month with their evidence gap stated plainly.',
  'refresh-priorities':
    'Inspect the evidence behind the highest-ranked technical and content items before accepting their order. Update the queue when a missing input, stale crawl or page review changes the case for the work.',
  'technical-watch':
    'Open the crawl, index or link component that produced the change before treating the whole site as unhealthy. Fix scope, quota or provider failures first, then rerun the same watch configuration.',
  'update-postmortem':
    'Review the winning and losing pages as separate groups and check the queries behind each movement. Record supported hypotheses, then use focused page or segment reports to test them after the update window.',
}

export const reportScheduleNotes: Partial<Record<string, string>> = {
  'ai-referrals':
    "Ask your agent to run this weekly or monthly and tell you which assistants and landing pages are new. Compare complete GA4 periods because today's traffic can still be arriving or attributed.",
  'compare-crawls':
    'Your agent can schedule matching crawls and compare each new snapshot with the previous one. Keep the start URL, scope and limits stable or the change list will mix site changes with crawl changes.',
  'crawl-diff':
    'This works well as a scheduled release check. Ask your agent to repeat the same bounded crawl after a deployment and report only the findings that appeared, changed or disappeared.',
  'crawl-history':
    'Scheduled crawls can build this history for you. Use the same site, start URL and limits when you want your agent to report meaningful changes between runs.',
  'crawl-report':
    'If freshness matters regularly, ask your agent to schedule a new site crawl and report back when the findings change. Reopening the same snapshot will never show work released after its creation date.',
  'ctr-underperformers':
    'A weekly or monthly agent task can surface newly underperforming queries without making you check Search Console by hand. Use complete date ranges and leave enough time between runs for snippet changes to collect useful data.',
  'decaying-pages':
    'Ask your agent to check for new declines every month and send you the affected pages and queries. Keep the comparison windows matched so seasonality and partial weeks do not become fake decay.',
  'index-watch':
    'An agent can run this watch on a schedule and tell you when a saved URL changes state. Keep quota failures and unchecked URLs in the update so silence never looks like stable indexing.',
  'llms-txt-audit':
    'Schedule this after deployments or content changes if the file is generated automatically. Your agent can report broken links, parse errors or removed entries without treating the file as proof of AI visibility.',
  'monthly-action-plan':
    'This is a natural monthly agent task. Have it build the plan after the latest crawl and Google data are complete, then keep unfinished work and missing evidence visible in the next run.',
  'monthly-report':
    'Your agent can prepare this on the same day each month and send you the new actions with their supporting evidence. Use complete reporting periods so a partial month does not look like a drop.',
  'search-performance-overview':
    'Ask your agent to run this weekly or monthly and report the pages, queries, countries or devices that moved most. Compare complete periods with the same filters before treating a change as real.',
  'site-crawl':
    'You can ask your agent to run this audit on a schedule and report new or resolved findings. Keep the crawl scope and limits consistent when you want the changes to mean something.',
  'technical-watch':
    'This monitor is built for a scheduled agent task. Run the same configuration regularly and have the agent report changed crawl, index or link evidence alongside any provider or quota failure.',
  'traffic-anomaly':
    'A scheduled agent can check complete Search Console periods and alert you when a page, query or segment moves outside its normal range. The alert should include the affected rows, not a guessed explanation.',
}
