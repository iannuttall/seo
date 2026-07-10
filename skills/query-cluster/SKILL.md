---
name: query-cluster
description: Cluster retained GSC queries by token overlap. Use when an agent needs deterministic demand themes without embeddings.
---

# Query cluster

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `opportunities` when discovery is needed.
2. Call `seo_describe_report` with id `query-cluster` before supplying parameters.
3. Call `seo_run_report` with id `query-cluster` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Clusters are lexical groupings and do not prove shared intent, page targeting, or a content gap.
- Check retained row completeness, filters, thresholds, unclustered rows, and stable ordering.
