---
name: redirect-trace
description: Record every HTTP redirect hop and inspect the final page's indexability signals; use it to debug loops, broken chains, and destination mismatches for one URL.
---

# Trace one redirect path

Use `redirect-trace` when a specific URL behaves unexpectedly after a move,
canonical change, or routing release. It follows HTTP redirects manually,
records each response, and audits the final destination for basic indexability
and canonical evidence. The trace is one observation from the machine and time
that ran it; CDNs, geography, cookies, user agents, and later deploys can differ.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"monitoring"}`. Call
`seo_describe_report` with `{"id":"redirect-trace"}`, then call
`seo_run_report`, for example
`{"id":"redirect-trace","params":{"url":"https://example.com/old-page","maxHops":8,"js":false,"refresh":true}}`.

The CLI uses the same registry:

```sh
seo reports describe redirect-trace --json
seo reports run redirect-trace --params '{"url":"https://example.com/old-page","maxHops":8,"refresh":true}' --json
```

`maxHops` is currently a broad number in discovery. Pass a small positive whole
number; very large chains are not a useful success condition.

## Interpret the output

Read `chain` in order. Each step contains the requested URL, status, `Location`,
resolved next URL, and duration. Then compare `finalUrl` with `finalPage` and
`summary.finalStatus`. `summary.issues` can identify a loop, hop limit,
redirect without location, final 4xx or 5xx, non-indexable final page, or a
canonical mismatch.

Inspect `metaRobots`, `xRobotsTag`, canonical, and `warnings` as observations.
A missing `finalPage` or fetch warning limits indexability conclusions.
JavaScript rendering affects final-page extraction, not the HTTP redirect chain.
A canonical pointing elsewhere can be intentional; a 302 can also be
intentional. The report does not know the desired destination.

## Act safely

Confirm the intended URL map before editing redirects. Prefer one direct
permanent redirect for a genuine move, remove loops, restore missing locations,
and align the final canonical only when the destination is correct. Re-run the
trace after deployment. Do not declare an SEO defect or ranking impact from a
chain difference without intent and search evidence.
