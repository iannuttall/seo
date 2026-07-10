---
name: segment-impact
description: Compare matched retained GSC rows across adjacent periods for one dimension; use it to locate where observed movement is concentrated without treating missing rows as zero.
---

# Compare segment movement

Use `segment-impact` after a property-level change is visible and you need to
find which pages, queries, countries, or devices moved. It compares equal-length
adjacent finalized GSC windows. The report deliberately limits conclusions to
segments retained in both windows, so its deltas are comparable without
inventing zeros for rows that disappeared from one retained result set.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"diagnosis"}`, then
`seo_describe_report` with `{"id":"segment-impact"}`. Then call
`seo_run_report` with the described report, for example
`{"id":"segment-impact","params":{"site":"sc-domain:example.com","dimension":"page","days":28,"compareDays":28,"limit":20,"maxRows":50000,"unmatchedLimit":10}}`.

The CLI uses the same schema:

```sh
seo reports describe segment-impact --json
seo reports run segment-impact --params '{"site":"sc-domain:example.com","dimension":"page","days":28,"compareDays":28,"limit":20,"maxRows":50000,"unmatchedLimit":10}' --json
```

Use either relative windows or an explicit `startDate` and `endDate` after
checking the current schema. Do not send undeclared fields.

## Interpret the output

Confirm `before`, `after`, and `rangeDays` before reading movement. Inspect
`dataStatus`, `source.before`, `source.after`, and `source.completeness` for
provider calls, row caps, and possible truncation. `selection` explains invalid,
duplicate, conflicting, matched, unmatched, returned, and limited rows.

In `items`, `clickDelta` and `impressionDelta` are after minus before. A positive
`positionDelta` is worse because a larger GSC average position is lower in the
results. `unmatchedSegments` are observations retained in one window only; they
are not gains from or losses to zero. Read `warnings`, `caveats`, and
`methodology` before describing a leading segment.

## Act safely

Use the top matched movers to define a smaller investigation: audit affected
pages, group repeated templates, or compare query intent. Check unmatched rows
separately with a wider export if they matter. Segment concentration does not
establish why movement happened, and a limited or possibly truncated result
cannot support an inventory-wide winner or loser claim.
