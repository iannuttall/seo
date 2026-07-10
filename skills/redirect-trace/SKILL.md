---
name: redirect-trace
description: Trace one redirect chain. Use when an agent needs hop, loop, response, final indexability, or canonical evidence for a URL.
---

# Redirect trace

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `monitoring` when discovery is needed.
2. Call `seo_describe_report` with id `redirect-trace` before supplying parameters.
3. Call `seo_run_report` with id `redirect-trace` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Treat the trace as one current fetch path and record max-hop, loop, failure, and rendering limits.
- A redirect or canonical difference may be intentional. Verify the desired destination before calling it a defect.
