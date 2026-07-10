---
name: ai-readiness
description: Assess technical AI-search readiness without inventing a visibility score or citation forecast. Use when checking access, indexability, snippets, page structure, and optional agent resources from crawl evidence.
---

# Assess AI readiness

AI-search systems can only use content they can retrieve and interpret, but technical eligibility is not selection. This report keeps access, indexability, snippet controls, content observations, bot policy, and agent resources separate. It deliberately returns an evidence-only assessment instead of an aggregate score.

## Run it

For MCP, call `seo_list_reports` with category `crawl` if the report id is not already known. Call `seo_describe_report` with `{ "id": "ai-readiness" }`, then `seo_run_report` with:

```json
{
  "id": "ai-readiness",
  "params": { "reportId": "crawl_example_20260710" }
}
```

Use `structuredContent` after confirming `isError` is false. The equivalent CLI flow is:

```sh
seo reports describe ai-readiness --json
seo reports run ai-readiness --params '{"reportId":"crawl_example_20260710"}' --json
```

Supplying `url` instead of `reportId` starts a fresh crawl. Reusing a saved report makes this assessment comparable with other follow-ups.

## Interpret the assessment

Start with `dataStatus`, the crawl caveats, and each check's `evaluated` flag. `unknown` means the necessary evidence was unavailable; it is not a failure or a pass. Bot access describes the observed policy for the crawl entry point, not proven access to every URL. Valid JSON-LD is syntax evidence, not proof of entity recognition or rich-result eligibility. An optional protocol file can aid machine discovery but its absence is not a search defect.

Prioritize hard technical conflicts first: failed responses, blocked crawling, explicit non-indexing, or restrictive snippet directives where those settings contradict publisher intent. Then review semantic structure and answerable content as observations, not requirements. Verify changes with a fresh crawl using the same scope. Never translate a clean report into claims about indexing, rankings, AI visibility, selection, citations, or traffic; those outcomes require separate evidence.
