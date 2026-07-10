---
name: index-watch
description: Monitor a bounded URL set with Google Search Console URL Inspection and interpret exact indexed-state evidence, current reviews, regressions, recoveries, failures, and quota-deferred checks. Use when an agent needs to check whether watched URLs changed indexing state, investigate exact robots/indexing/fetch/canonical evidence, or plan recurring sitemap monitoring without overstating URL Inspection as a live test.
---

# Index watch

Call `seo_list_reports` with category `monitoring` when discovery is needed.
Call `seo_describe_report` with id `index-watch`, then call `seo_run_report`
with that id and only the described parameters. Read `structuredContent` as the
machine contract. Use report id `index-monitor` for a bounded oldest-first
sitemap sample. Use report id `index-coverage-plan` before monitoring a large
inventory across multiple Search Console properties.

For the shared schema-backed CLI path:

```bash
seo reports describe index-watch --json
seo reports run index-watch --params '{"site":"sc-domain:example.com","urls":["https://example.com/a","https://example.com/b"],"dailyLimit":25}' --json
```

This validates the same parameters used by MCP. The focused commands below add
saved monitoring state, sitemap selection, and friendlier flags for recurring
human workflows.

## Run the report

1. Pass the selected Search Console property as `site`.
2. Keep explicit `urls` at 100 or fewer. Every URL must belong to the property.
3. Use `dailyLimit` only to set a lower local safety limit. It cannot exceed
   Google's documented 2,000 daily inspections per property.
4. For sitemap monitoring, check `source.possiblyTruncated`, `dataStatus`,
   `warnings`, `neverAttempted`, `neverSucceeded`, `retryWaiting`, `fresh`,
   `stale`, `due`, `selected`, and `unselectedDue` before summarising coverage.
5. Read `currentIssues`, `regressions`, `recoveries`, `failed`, `quotaBlocked`,
   and `deferred` separately.

CLI equivalents:

```bash
seo index-watch --site sc-domain:example.com --urls https://example.com/a,https://example.com/b --json
seo index-watch --site sc-domain:example.com --sitemaps https://example.com/sitemap.xml --inspect-limit 25 --json
seo index-watch --site sc-domain:example.com --sitemaps https://example.com/sitemap.xml --plan --json
```

## Interpret evidence

- `inspectionStatus: succeeded` means Google returned an indexed snapshot.
- `indexStatus` maps exact verdicts: `PASS` to `indexed`, `NEUTRAL` to
  `excluded`, `FAIL` to `invalid`, and everything else to `unknown`.
- `currentIssue` means stable enum or canonical evidence needs review against
  the URL's intended state. An excluded URL or alternate canonical may be
  intentional.
- `changeKind: regression` means a prior clear successful snapshot became an
  issue. `recovery` means the reverse.
- `baseline` means there is no previous successful snapshot. A first-run issue
  is still a current review and a new alert.
- `failed`, `quota-blocked`, and `deferred` are operational outcomes, not SEO
  defects. They are not comparable with a successful indexed state.
- `requestSent: false` means the local quota broker blocked the call before it
  reached Google. Use `retryAt` when it is present.
- Use `issueCodes` and typed `changes` for machine reasoning. Keep
  `coverageState` as display evidence because Google localises that free text.

## Guardrails

- URL Inspection is Google's indexed version for one URL. It is not a live
  crawl and does not guarantee current search appearance.
- Do not report every `NEUTRAL` verdict or canonical difference as a defect.
- Do not infer inventory-wide health from the bounded selected sample.
- Sitemap failures wait 24 hours before automatic selection retries. Do not
  retry quota-blocked or deferred URLs before `retryAt`.
- The local UTC-day quota ledger cannot observe calls made by other machines or
  Google clients. A provider 429 remains authoritative.
- Fix authentication and property access failures instead of treating the
  report as sparse data.
- Prefer BYO Google credentials if shared OAuth project quota becomes a limit.
