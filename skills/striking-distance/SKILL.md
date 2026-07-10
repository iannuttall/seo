---
name: striking-distance
description: Find retained GSC query-page rows with average positions from 11 through 20; use it to build a bounded review queue near page-one visibility.
---

# Review striking-distance rows

Use `striking-distance` to find query-page combinations whose retained GSC
average position falls from 11 through 20. This range can surface useful review
candidates, but it is a heuristic boundary. Average position varies by search,
device, country, and day, so the report does not prove that a URL consistently
ranks on a literal second results page or predict how many clicks a change will
produce.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"diagnosis"}`, call
`seo_describe_report` with `{"id":"striking-distance"}`, then call
`seo_run_report` with only described parameters. Example:
`{"id":"striking-distance","params":{"site":"sc-domain:example.com","days":28,"minImpressions":50,"limit":10,"includeBrand":false,"verifyContent":true,"verifyLimit":5}}`.

The CLI has exact registry parity:

```sh
seo reports describe striking-distance --json
seo reports run striking-distance --params '{"site":"sc-domain:example.com","days":28,"minImpressions":50,"limit":10,"includeBrand":false,"verifyContent":true,"verifyLimit":5}' --json
```

Add `brandTerms`, JavaScript rendering, or bounded fetch-rate controls only
after inspecting the schema and when the investigation needs them.

## Interpret the output

Check `range`, `rangeDays`, `dataStatus`, and `source` before the item list.
`source.possiblyTruncated` and retained-row completeness limit any all-clear.
Use `selection` to see what was invalid, outside the position range, branded,
below thresholds, eligible, returned, or limited. `methodology` explains the
priority heuristic.

For each item, read the observed query, URL, clicks, impressions, CTR, average
position, recommendation evidence, and optional `contentVerification`.
`verification` reports requested, attempted, verified, technical, and failed
counts; unverified or failed pages must keep lower confidence. Groups and
templates show repeated patterns only within retained candidates.

## Act safely

Audit a small number of high-impression candidates. Fix verified technical
problems first; otherwise compare intent, title framing, page coverage, and
internal links against observed query evidence. Do not rewrite a page solely
because it sits inside the position band, and do not present the priority score
as expected traffic or ranking lift.
