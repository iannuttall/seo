# Agent Notes

`seo` is a TypeScript SEO CLI, a local stdio MCP server, a hosted MCP server
(`https://seoskill.dev/mcp`, `apps/mcp`), one skill and the seoskill.dev site
(`apps/web`). The public repo is `iannuttall/seo`; the npm package is the
unscoped `seo`. `CLAUDE.md` is a symlink to this file.

This file holds only the rules you need for coding here that the code cannot
tell you. Product and privacy decisions are not rules for this file.

- Read `CONTENT.md` before you write copy a person reads: site, docs, help
  text, result text, README, metadata.
- Read `apps/web/AGENTS.md` before you touch `apps/web`.

## Code patterns

- Each shared command and MCP tool is defined once in
  `packages/core/src/commands` (`tools.ts`). The CLI, the local MCP server
  and the hosted server only supply a `ToolSurface`. Never put report logic
  in a surface.
- Core code must run in Node and in Cloudflare Workers.
- Bing blocks Cloudflare's network, so `HOSTED_BING` stays off and Bing
  calls run locally.
- Provider packages (`seo/provider-sdk`) return normalized evidence only.
- Decision models sit behind `packages/core/src/decision-model.ts`.
- Edits to an agent's MCP config keep unrelated settings, make a backup and
  never replace an entry that `seo` did not write.
- The Clicky account password never leaves the server.

## Report truth

- Keep zero, missing, unavailable, filtered, partial and capped distinct. A
  capped or partial source cannot support a zero or an all-clear.
- Do not claim causation, ranking impact or indexing unless the evidence
  shows that exact thing. Label heuristics as heuristics.
- Keep each source's own metric names. A Clicky visit is not a Google
  Analytics session or user. Research data never replaces or blends with
  first-party data.
- Search Console dates use the `America/Los_Angeles` calendar through the
  shared final-data helper.
- Sort with stable tie-breakers so input order never changes output.
- Read every JSON API response with `readJson`, never `response.json()`.
- Bound every fetch, list and output before the work starts, not after.
  Peak memory follows the active work window, not the site size.

## Real data never goes in the repo

Never write a real domain, site, client name or real account data into
code, tests, fixtures, comments, docs, commits or PR text. Use
`example.com`, `example.org` or `*.example`. Grep the diff for real domains
before every commit. The only allowed real domain is the author link in the
site layout.

## Tests and CI

Add a test only when Ian asks for it or it guards a real bug that hit a
user. Never test a switch, flag, message, copy, config or wiring. Keep a test
only when it proves real behaviour: correct numbers and states from
realistic input, parsing real payloads, security boundaries (OAuth, sealing,
token file permissions, provider package checks, safe MCP config edits), or
public contracts (CLI JSON, MCP tools, package exports, old seoskill.dev
URLs).

CI is one job, `checks` (build, typecheck, lint, test), about two minutes.
Tests make no network calls and do not sleep.

## Working in the repo

- Gates, all four before a change is done: `pnpm build`, `pnpm typecheck`,
  `pnpm test`, `pnpm lint`. Format with `pnpm exec biome format <files>
  --write`.
- The global `seo` on this machine is the published release. To try source
  changes run `pnpm build:package` then `node dist/cli.js <command>`. Do not
  link or shim the global command.
- Commits are focused conventional commits. Ship through a PR to `main`.
- `docs/` and `docs/plans/` are git-ignored local notes. Never depend on
  them for product behaviour. Log each reproducible product bug in the local
  `docs/known-issues.md`.
- Never commit secrets, tokens, `.dev.vars*`, local config, cache files or a
  populated generated credential module.

## Release and deploy

- Merging to `main` deploys the site and the hosted server through
  Cloudflare's Git builds. The hosted deploy (`pnpm deploy:mcp`) applies new
  D1 migrations first. A new `SEAL_KEY` signs everyone out and makes stored
  keys unreadable.
- Release: bump the version in `package.json`, `.claude-plugin/plugin.json`
  and `server.json` (two places), add a `CHANGELOG.md` entry, and merge the
  PR. `release.yml` publishes to npm with trusted publishing and tags the
  version. Never add an `NPM_TOKEN`.
- Before a release, install the packed tarball in an empty folder and check
  `seo --version`, `seo mcp serve --test`, the `seo` and `seo/mcp` imports
  and the packaged skill.
- Version 1.0.0 removes the old report names (`packages/cli/src/renames.ts`)
  and the 0.2 commands under "More commands" in `seo help all`. Do not add to
  them.

## Naming

The product is SEO Skill when prose needs a name; `seo` is the command and
package. Say "Google Analytics" everywhere outside `packages/core/src/ga4`.
Speak of the skill in the singular. Do not publish or teach `@seo/*`
workspace packages. The skill (`skills/seo/SKILL.md`) stays one router file
under about a thousand words; follow `skills/README.md`.
