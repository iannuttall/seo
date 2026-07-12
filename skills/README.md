# Agent skills

This package ships one skill: `seo`. It teaches an agent how to use `seo`
without reading the whole repo.

The skill is a router, not a manual. It explains the discover, describe, run
flow, names the report ids for common jobs, and states the evidence rules that
apply to every report. It does not memorise each report. Per-report depth, when
to use a report, when to avoid it, its schema, the order to read its output,
what its evidence cannot support, and one verification step, is fetched at
runtime with `describe`. This keeps the skill small and always in sync with the
registry.

## Install

The skill works best with the MCP server installed. This command is an
interactive setup flow for a human:

```bash
seo mcp install
```

The skill also works by calling the CLI directly when MCP tools are not
available. The npm package and repository contain the same skill. Install it
with the standard agent skills installer:

```bash
npx skills add iannuttall/seo
```

Use `seo skills list` or `seo skills path seo` to inspect the copy bundled with
the npm package.

## Discover, describe, run

The MCP path is deliberately small: discover ids with `seo_list_reports`, load
one report's full depth with `seo_describe_report`, then execute it with
`seo_run_report`. The same catalog is available without MCP:

```bash
seo reports list --json
seo reports describe <report-id> --json
seo reports run <report-id> --params '<json>' --json
```

Always describe a report before its first run. The describe response is the
per-report manual: its `readOrder`, `doNotClaim` limits, `verify` step, and
`related` ids come straight from the registry.

## Adding a report

Register the report once in `packages/mcp/src/report-registry.ts`, including its
depth guidance in `packages/mcp/src/report-guidance.ts` and
`packages/mcp/src/report-depth.ts` (`readOrder`, `doNotClaim`, `verify`,
`related`). CLI discovery, MCP discovery, and the skill then share its id,
description, input schema, handler, and depth automatically. No new skill file
is needed. The router only lists report ids for common jobs; a report earns a
mention there when it belongs in one of those chains.

Run `pnpm skills:validate` after changing the skill or the registry. The
validator checks the skill frontmatter and word count, that every command and
report id the skill names resolves, that the MCP tool names are real, and that
every `evals/*.json` is well formed.

## Evals

Behaviour tests for the skill live in the top-level `evals/` directory. See
[../evals/README.md](../evals/README.md) for the file shape and how to run them.
