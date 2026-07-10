---
name: diagnose-property
description: Combine anomaly, movement, decay, cannibalisation, and opportunity evidence for one GSC property; use it to orient an investigation before choosing a narrower report.
---

# Diagnose a property

Use `diagnose-property` for broad orientation when the question is still
"what changed or deserves attention?" It runs several first-party analyses in
one call, but each nested section keeps its own evidence and availability. The
combined priorities help choose the next investigation. They do not turn
correlated signals into a cause or guarantee that a recommended change will
improve search performance.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"diagnosis"}`. Call
`seo_describe_report` with `{"id":"diagnose-property"}` next. Then call
`seo_run_report` with the id and schema-valid parameters, for example
`{"id":"diagnose-property","params":{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false}}`.

CLI parity uses the same registry:

```sh
seo reports describe diagnose-property --json
seo reports run diagnose-property --params '{"site":"sc-domain:example.com","days":90,"recentDays":7,"limit":10,"includeBrand":false}' --json
```

Use MCP `structuredContent` or CLI JSON for reasoning. Presentation text is a
summary, not a substitute for nested evidence.

## Interpret the output

Read top-level `dataStatus` before the counts in `summary`. Inspect
`skippedSections` and `partialReasons`; unavailable anomaly data must not erase
valid decay or opportunity evidence, and a skipped section is not a zero.
Review `priorities` with their confidence, reason, and action, then trace each
one into `anomaly`, `updateCorrelation`, all four `segments`, `decay`,
`cannibalization`, `strikingDistance`, or `quickWins`.

Check each nested date window, source completeness, retained-row limits,
warnings, caveats, and content-verification status. `updateAttribution` is
timing context. Segment deltas describe matched retained rows. Opportunity
scores and average positions are prioritisation aids, not traffic forecasts or
stable ranks.

## Act safely

Choose one well-supported priority and verify it with the relevant focused
report or a page audit. Preserve winning pages, compare changed and unchanged
sections, and make reversible changes first. Do not launch sitewide rewrites
from a broad diagnosis, especially when any contributing source is partial,
capped, sparse, or unavailable.
