# Agent Notes

This repo is a local-first TypeScript SEO CLI and MCP server. Build for two users:

- Humans: start with a simple prompt flow and a main report.
- Agents: use explicit flags, structured JSON, and low-level commands.

Keep the human path calm. Keep the agent path powerful.

## Product Rules

- `seo start` is the human onboarding entry point.
- `seo help` and `seo --help` must stay short and useful. Do not dump every command at the root.
- `seo report` is the main report. It should run first, explain gaps, then recommend follow-up commands.
- Saved site profiles are called project profiles in user-facing copy.
- `--project` is the primary selector for saved profiles.
- `--client` is a legacy alias. Keep it working, but do not teach it in new human-facing output.
- Commands must still work without a project profile when given `--site` or `--url`.
- Sparse or missing data should skip sections with a clear reason, not fail the whole report.
- JSON mode is for agents and scripts. Never add prompts when `--json` is used.
- Interactive prompts are for humans only. Check TTY/CI before prompting.

## Repo Map

- `packages/core`: business logic, storage, providers, GSC/GA4 clients, fetch/extract, analysis, reports, workflows.
- `packages/cli`: `seo` command, prompt flows, command help, terminal output.
- `packages/mcp`: MCP stdio server exposing core analysis tools.
- `apps/web`: placeholder web package.
- `scripts`: release/build checks and local utilities.

Useful CLI areas:

- `packages/cli/src/index.ts`: root command registration and short help.
- `packages/cli/src/args.ts`: shared CLI arg parsing, including `projectArg`.
- `packages/cli/src/selection.ts`: site/project/GA4 selection and prompt fallbacks.
- `packages/cli/src/commands/setup`: `seo start` / guided setup.
- `packages/cli/src/commands/workflows/diagnose-property.ts`: `seo report` and diagnosis workflow wrapper.
- `packages/cli/src/commands/report-options.ts`: shared report flags.

Useful core areas:

- `packages/core/src/analyze/diagnose-property.ts`: main diagnosis primitives and graceful section fallbacks.
- `packages/core/src/analyze/reports`: narrative report assembly.
- `packages/core/src/analyze/workflows`: agent workflow reports.
- `packages/core/src/export`: CSV/export rendering.

## Development Commands

Run these from the repo root:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

For CLI smoke tests, use the built entry:

```bash
node packages/cli/dist/index.js help
node packages/cli/dist/index.js report --help
node packages/cli/dist/index.js start --dry-run
node packages/cli/dist/index.js report --project keep --json
```

Use `pnpm exec biome format <files> --write` after edits. Avoid unrelated formatting churn.

## Help Page Requirements

Every command and subcommand needs useful `meta.description`.

After changing CLI commands, run a help sweep. At minimum check:

```bash
node packages/cli/dist/index.js help
node packages/cli/dist/index.js help all
node packages/cli/dist/index.js report --help
node packages/cli/dist/index.js projects --help
node packages/cli/dist/index.js start --help
```

Root help should show a curated path:

- `seo start`
- `seo report`
- `seo projects list`
- `seo refresh-priorities`
- `seo quick-wins`
- `seo second-page`
- `seo technical-watch`

Do not let `seo help` return `Unknown command help`.

## Project Selection

When adding a command that can use a saved profile:

1. Add both args:
   - `project`: `Saved project id or name.`
   - `client`: `Legacy alias for --project.`
2. Resolve with `projectArg(args)`.
3. Pass the result as `client` to existing internal selection APIs until core types are renamed.
4. In generated commands or docs, print `--project`, not `--client`.

If both flags are passed with different values, fail clearly.

## Onboarding Rules

The guided flow should not ask humans for implementation details.

- Ask for project name, not client id.
- Derive stable ids automatically.
- Explain project profiles briefly when saving one.
- Default to saving a project profile.
- Let users skip profile creation and continue with `--site`.
- Next commands printed by setup should start with `seo report --project <id>`.

## Report And Fallback Rules

The report stack must be robust against partial data:

- If anomaly/update data is too sparse, skip those sections and keep the report.
- Include skipped sections in terminal, JSON, and narrative caveats.
- Recommend useful follow-up commands when sparse data exists, such as lower-threshold `quick-wins` and `second-page`.
- Do not hide real errors that affect all output, such as bad auth or invalid property selection.

## Style

- TypeScript ESM only.
- Prefer structured APIs over string parsing.
- Keep CLI wrappers thin; put reusable analysis in `packages/core`.
- Keep terminal output concise and action-oriented.
- Use ASCII unless the edited file already uses non-ASCII for a reason.
- Do not introduce large abstractions unless they remove real duplication.

## Local Auth Notes

The CLI uses local Google OAuth tokens and local config/cache paths. The repo checkout may not include production shared OAuth credentials. For local auth testing use one of:

- `seo auth setup-client`
- `SEO_GOOGLE_CLIENT_ID`
- `SEO_GOOGLE_CLIENT_SECRET`
- legacy `GSC_CLIENT_ID`
- legacy `GSC_CLIENT_SECRET`

Do not commit secrets or local token/config files.
