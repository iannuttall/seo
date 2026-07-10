---
name: workflow-diagnose-property
description: Run the full property diagnosis workflow. Use when an agent needs a narrative, evidence, action queue, and next steps in one call.
---

# Diagnosis workflow

Use the compact MCP report flow:

1. Call `seo_list_reports` with category `workflows` when discovery is needed.
2. Call `seo_describe_report` with id `workflow-diagnose-property` before supplying parameters.
3. Call `seo_run_report` with id `workflow-diagnose-property` and only the described parameters.

Read MCP `structuredContent` as the machine contract. Keep returned Markdown or
text for the user-facing explanation.

## Evidence rules

- Inspect every step status, skipped section, source window, warning, caveat, and retained limit.
- Keep partial sections independent and preserve the evidence reference behind each recommended action.
