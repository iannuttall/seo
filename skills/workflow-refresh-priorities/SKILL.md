---
name: workflow-refresh-priorities
description: Combine several first-party opportunity reports into a bounded refresh queue. Use it to prioritize investigation while preserving each source's distinct meaning and limits.
---

# Refresh priorities workflow

This workflow helps choose what to inspect next by combining decay, position,
CTR, exposure, diagnosis, content verification, and optional GA4 signals. It
does not make those signals interchangeable or predict the benefit of an edit.
The queue is a deterministic prioritization aid, not an autonomous content
brief.

## Run it

Use the exact MCP discovery flow:

1. Call `seo_list_reports` with `category: "workflows"` and select `workflow-refresh-priorities`.
2. Call `seo_describe_report` with `id: "workflow-refresh-priorities"`; inspect all bounds.
3. Call `seo_run_report` with that id and schema-valid parameters.

CLI parity:

```sh
seo reports describe workflow-refresh-priorities --json
seo reports run workflow-refresh-priorities --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false,"verifyContent":true,"verifyLimit":5}' --json
```

Add `ga4PropertyId` only when that property's sessions are needed and accessible.
`verifyLimit` caps fetched content checks; it does not verify every queued URL.

## Interpret and act

Read the workflow's steps and skipped states before its queue. For each queued
item preserve `source`, `impactKind`, score breakdown, date window, completeness,
verification status, and rationale. A click decline, low CTR, second-page
average position, and GA4 session signal have different semantics. Missing GA4
or failed content fetches must remain unavailable, not become zero-weight proof.

Inspect the top few URLs manually. Confirm query intent, current content,
technical accessibility, internal links, competing pages, and whether a recent
change already explains the observation. Choose a bounded edit only when the
evidence supports it, record the change date, and measure later. Never delete,
merge, or rewrite content solely from the combined score. Do not present the
score as expected clicks, revenue, ranking lift, or causal confidence.

MCP `structuredContent` is the machine contract. Use Markdown for a concise
human queue while retaining the underlying evidence fields for agents.
