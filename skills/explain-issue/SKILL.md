---
name: explain-issue
description: Translate one crawler rule id into technical meaning, remediation guidance, and a verification method. Use after a crawl identifies a rule and before turning it into implementation work.
---

# Explain a crawler rule

Crawler findings use stable rule ids so agents can join summaries, affected URLs, and guidance without parsing prose. This report explains the rule definition; it does not inspect a site or prove that the rule triggered on any particular page.

## Run it

If the id is unknown, use `list-rules` first. For MCP report discovery, call `seo_list_reports` with category `crawl` only when needed. Then call `seo_describe_report` with `{ "id": "explain-issue" }` and `seo_run_report` with:

```json
{
  "id": "explain-issue",
  "params": { "ruleId": "missing_title" }
}
```

Check MCP `isError`, then read `structuredContent`. The exact CLI equivalent is:

```sh
seo reports describe explain-issue --json
seo reports run explain-issue --params '{"ruleId":"missing_title"}' --json
```

## Apply the guidance carefully

Read the rule's category, default severity, why it matters, fix steps, ignored impact, verification method, and agent hints. Default severity is generic prioritization metadata; actual urgency depends on affected templates, page purpose, response state, demand evidence, and publisher intent. Guidance describes the condition checked by the crawler, not a search-engine penalty or guaranteed ranking effect.

Pair the definition with `affected-urls` from the same saved crawl. Inspect the per-URL evidence and sample enough page types to find the implementation boundary. For `missing_title`, for example, confirm that the final HTML truly lacks a useful title and that the crawler did not receive an error or intermediate response before changing a template. Create the smallest shared fix, preserve intentional controls, and use the stated verification method on the same bounded URLs. If no affected-URL evidence exists, present the output as reference documentation only.
