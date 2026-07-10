---
name: internal-links
description: Find fetched source pages with query evidence relevant to one target URL and no verified contextual link; use when an agent needs bounded link candidates rather than automatic anchor insertion.
---

# Internal link candidates

Use this report to find source pages whose retained GSC queries overlap with demand for a target URL. It resolves target aliases, fetches bounded candidate pages, checks technical state, and inspects observed links and placement before returning a review candidate. Exact query overlap is stronger than lexical overlap, but neither proves that a link belongs in the page or that adding one will improve rankings.

## Run the report

Use the compact MCP flow:

1. Call `seo_list_reports` with `{"category":"opportunities"}`.
2. Call `seo_describe_report` with `{"id":"internal-links"}`.
3. Call `seo_run_report` with `{"id":"internal-links","params":{"site":"sc-domain:example.com","targetUrl":"https://example.com/guides/seo","days":90,"limit":15,"checkLimit":40,"minImpressions":25}}`.

The CLI invokes the same handler:

```sh
seo reports describe internal-links --json
seo reports run internal-links --params '{"site":"sc-domain:example.com","targetUrl":"https://example.com/guides/seo","days":90,"limit":15,"checkLimit":40,"minImpressions":25}' --json
```

`site` and `targetUrl` are required. `checkLimit` bounds fetched candidates; `limit` bounds returned candidates. Increase fetch concurrency or enable JavaScript only when the site and task justify the extra load.

## Interpret and act

Check `dataStatus`, target verification, aliases, canonical, technical signals, and source completeness first. Review `selection.attemptedSources`, checked, failed, unchecked, technical exclusions, alias exclusions, and existing-link exclusions. A low `checkLimit` can leave plausible candidates unchecked. Each item includes exact or lexical query matches, shared terms, impressions, fetch diagnostics, technical signals, and `linkEvidence`. Distinguish `missing`, `non-contextual-only`, and `alias-contextual`; respect observed and limited link counts. Priority is a heuristic combining match evidence, not estimated impact.

Safe action is to read the source passage, confirm the target is genuinely useful there, choose natural anchor wording, add one contextual link, and recrawl to verify it. Do not insert links in bulk, replace navigation links without reason, link from technically unsuitable pages, or claim ranking impact from a candidate score.
