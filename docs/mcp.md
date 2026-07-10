# MCP and agents

The local stdio MCP server exposes the same report implementations as the CLI
without loading dozens of tool schemas into an agent's context.

## Install it

Humans can choose detected clients interactively:

```bash
seo mcp install
```

Agents and setup scripts must choose targets explicitly:

```bash
seo mcp install --claude-desktop --json
seo mcp install --claude-code --json
seo mcp install --cursor --json
seo mcp install --all --json
```

Run or test the server directly:

```bash
seo mcp serve
seo mcp serve --test
```

## Compact tool surface

The default server exposes exactly three tools:

- `seo_list_reports` returns report ids, categories, and one-line descriptions.
- `seo_describe_report` returns the parameter schema for one report id.
- `seo_run_report` validates those parameters and runs the report.

This keeps tool discovery small while preserving the full report suite. Raw
provider passthrough and project-profile mutations remain explicit CLI work,
not hidden MCP side effects.

## Agent workflow

1. Call `seo_list_reports`, optionally with a category.
2. Pick the smallest report that answers the question.
3. Call `seo_describe_report` for that id.
4. Call `seo_run_report` with only the parameters that schema accepts.
5. Reason from `structuredContent`. Use returned text or Markdown as the
   display layer.
6. Check `dataStatus`, source completeness, caps, warnings, and caveats before
   making a conclusion.
7. Reuse saved crawl report ids for follow-ups instead of crawling again.

Useful report ids include:

- `workflow-diagnose-property` for the main diagnosis.
- `workflow-refresh-priorities` for a ranked action queue.
- `crawl-site`, then `top-fixes` or `affected-urls`, for technical work.
- `audit-page` and `performance-audit` for one URL.
- `index-watch` for bounded Google URL Inspection evidence.
- `pseo-audit` for repeated template families.
- `report-narrative` and `monthly-report` for readable reporting.

Call `seo_list_reports` instead of treating this list as the complete catalog.

## Error contract

Tool errors set `isError` and return a structured envelope:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Unknown report: example.",
    "retryable": false
  }
}
```

Do not parse error text when `structuredContent.error` is available.

## Skills and plugin metadata

Focused agent skills ship under `skills/` in the npm package and repository.
Install every packaged skill into a supported location with one command:

```bash
seo skills install --target agents
seo skills install --target codex
seo skills install --target claude
seo skills install --target project
```

Pass a skill name after `install` to copy only that skill. Use `--dir` for a
custom agent skills directory. Agents and CI should add `--json`.

The repository includes Claude plugin metadata, but the plugin is not yet
published to a marketplace.
