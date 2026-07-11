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
seo mcp install --codex --json
seo mcp install --cursor --json
seo mcp install --all --json
```

The installer preserves unrelated JSONC settings, backs up changed config files,
and refuses to replace an unmanaged server named `seo`. Codex is installed
through its own CLI so existing TOML comments and settings remain intact.

Your client launches the stdio process when it needs SEO tools. Run or test the
server directly only when configuring a client manually:

```bash
seo mcp serve
seo mcp serve --test
```

## Client setup

### Codex

`seo mcp install --codex` configures Codex CLI, the desktop app, and the IDE
extension through their shared config. The equivalent native command is:

```bash
codex mcp add seo -- npx -y seo mcp serve
codex mcp get seo
```

### Claude Code

`seo mcp install --claude-code` updates the user config. The equivalent native
command is:

```bash
claude mcp add --scope user seo -- npx -y seo mcp serve
claude mcp get seo
```

### Cursor

`seo mcp install --cursor` updates `~/.cursor/mcp.json`. Restart Cursor, then
open its MCP settings to check that `seo` is enabled.

### Claude Desktop

`seo mcp install --claude-desktop` updates the desktop config on macOS or
Windows. Restart Claude Desktop, then check the MCP indicator in a new chat.
Claude Code uses a separate config, so install both targets if you use both.

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
7. Treat `topFixes` as implementation candidates. Check `reviewObservations`
   before turning optional metadata, hardening headers, or one slow response
   into work.
8. Reuse saved crawl report ids for follow-ups instead of crawling again.

Useful report ids include:

- `search-performance-overview` to find where Google Search performance changed and what to inspect next.
- `refresh-priorities` for a ranked action queue.
- `site-crawl`, then `top-fixes` or `affected-urls`, for technical work.
- `audit-page` and `performance-audit` for one URL.
- `index-watch` for bounded Google URL Inspection evidence.
- `pseo-audit` for repeated template families.
- `narrative-report` and `monthly-report` for readable reporting.

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
Install them through the standard agent skills installer:

```bash
npx skills add iannuttall/seo
```

Use `seo skills list` or `seo skills path <name>` when you want to inspect the
copies bundled inside the npm package.

The repository includes Claude plugin metadata, but the plugin is not yet
published to a marketplace.
