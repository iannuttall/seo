# Agent Notes

`seo` is a TypeScript SEO CLI, a local stdio MCP server, a hosted MCP server
(`https://seoskill.dev/mcp`, `apps/mcp`), one router skill and the
seoskill.dev site (`apps/web`). The public repo is `iannuttall/seo`; the npm
package is the unscoped `seo`. `CLAUDE.md` is a symlink to this file.

Read before you write:

- `PRODUCT.md` before any product-shape decision.
- `CONTENT.md` in the same task before you write any copy a person reads:
  site, docs, help text, result text, README, metadata.
- `apps/web/AGENTS.md` before you touch `apps/web`.

## What the product is

- A data layer. It fetches first-party data (Search Console, Google
  Analytics, Bing Webmaster Tools, Clicky) and optional research data
  (DataForSEO, Ahrefs) and returns facts with their dates and limits. It
  gives no advice. The agent decides; a person approves.
- It keeps no reports, history, projects or decisions between runs, and adds
  no command whose job is to keep them. The agent decides what to store.
- Free. The hosted server keeps only a person id, linked Google and Bing
  accounts, saved keys, a saved Clicky login, Clicky sites and linked
  machines, sealed with `SEAL_KEY` in D1, plus one row per person, written
  at sign-up, on how they signed up (`signup_sources`). No report data, rows,
  site lists or request logs. Workers Logs stay off. Any change here must also change
  `PRIVACY.md` and `apps/mcp/README.md`.
- Research data never replaces or blends with first-party data.

## One engine

- The eight commands (`report`, `page`, `compare`, `index`, `research`,
  `data`, `crawl`, `internal-links`) plus `seo start` are the whole public
  surface. A new command or MCP tool needs Ian's approval; add a report
  section or extend a command first.
- Each shared command and MCP tool is defined once in
  `packages/core/src/commands` (`tools.ts`). The CLI, the local MCP server
  and the hosted server only supply a `ToolSurface`. Never put report logic
  in a surface.
- Core code must run in Node and in Cloudflare Workers.
- Crawl and internal links run only on the person's machine (CLI and local
  MCP). Bing also runs only there: Bing blocks Cloudflare's network, so
  `HOSTED_BING` stays off. The hosted server sends agents to
  `npx -y seo login` for these.
- `seo login` links a machine to the seoskill.dev account. The machine gets
  short-lived tokens and keys and makes the calls itself. Nothing goes back.
  The Clicky account password never leaves the server.
- Provider packages (`seo/provider-sdk`) are how anyone adds another
  analytics or research source. They return normalized evidence only, run
  only locally, and never add findings, commands, MCP tools or skill files.

## One way to run

- A report takes its target (site, URL or property) and optional dates. It
  returns everything it has.
- No flags, options or env switches that change what a report returns or
  means. Make the default right instead. Choices (brand terms, minimums,
  redirect merges) are automatic and shown in the output.
- More detail comes only from progressive disclosure: summary, then `rows`
  with an offset, then `full`. Each result ends with the command to run
  next; that is the only routing.
- Every command takes `--site` or `--url` each time. Nothing picks a site
  from saved state or a prompt.
- `seo start` signs in with Google, offers the MCP server (hosted first) and
  the skill, then stops. It asks for no other setting. JSON and CI modes
  never prompt. Edits to an agent's MCP config keep unrelated settings, make
  a backup and never replace an entry that `seo` did not write.

## Report truth

- Keep zero, missing, unavailable, filtered, partial and capped distinct. A
  capped or partial source cannot support a zero or an all-clear.
- Do not claim causation, ranking impact or indexing unless the evidence
  shows that exact thing. Label heuristics as heuristics.
- Keep each source's own metric names. A Clicky visit is not a Google
  Analytics session or user.
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

Do not add a test unless Ian asks for it or it guards a real bug that hit a
user. When unsure, do not add one. Never test a switch, flag, message, copy,
config or wiring. Keep a test only when it proves real behaviour: correct
numbers and states from realistic input, parsing real payloads, security
boundaries (OAuth, sealing, token file permissions, provider package checks,
safe MCP config edits), or public contracts (CLI JSON, MCP tools, package
exports, old seoskill.dev URLs).

CI is one job, `checks` (build, typecheck, lint, test), about two minutes. No
new jobs, shards, schedules, browser tests, network calls or sleeps without
Ian's approval.

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

- Release: bump the version in `package.json`, `.claude-plugin/plugin.json`
  and `server.json` (two places), add a `CHANGELOG.md` entry, and merge the
  PR. `release.yml` publishes to npm with trusted publishing and tags the
  version. Never add an `NPM_TOKEN`. Release only with Ian's yes.
- Before a release, install the packed tarball in an empty folder and check
  `seo --version`, `seo mcp serve --test`, the `seo` and `seo/mcp` imports
  and the packaged skill.
- Hosted server: `pnpm --filter @seo/hosted-mcp run deploy`. Apply new D1
  migrations with `wrangler d1 migrations apply seo-mcp --remote` first. A
  new `SEAL_KEY` signs everyone out and makes stored keys unreadable.
- The site deploys from `main` through Cloudflare.
- Version 1.0.0 removes the old report names (`packages/cli/src/renames.ts`)
  and the 0.2 commands under "More commands" in `seo help all`. Do not add to
  them.

## Naming

The product is SEO Skill when prose needs a name; `seo` is the command and
package. Say "Google Analytics" everywhere outside `packages/core/src/ga4`.
Speak of the skill in the singular. Do not publish or teach `@seo/*`
workspace packages. The skill (`skills/seo/SKILL.md`) stays one router file
under about a thousand words; follow `skills/README.md`.
