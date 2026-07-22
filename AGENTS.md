# Agent Notes

This is the source for `seo`, a local-first TypeScript SEO CLI, library,
router skill, and stdio MCP server. The public repository is
`iannuttall/seo`. The public npm package is the unscoped `seo` package.

`PRODUCT.md` is the durable product definition: users, purpose, brand
personality, vocabulary, and anti-references. Read it before writing any
user-facing copy or making product-shape decisions. This file owns the
engineering contract.

`CONTENT.md` is the durable writing guide for website copy, documentation,
report pages, command help, onboarding, metadata, and README content. Read it
before writing or editing user-facing language.

Reading `CONTENT.md` is mandatory in the same task before writing, editing, or
generating user-facing copy. Do not rely on memory or treat shared template
copy as an exception.

The product has two primary users:

- Humans start with a guided prompt flow and one main report.
- Agents use explicit flags, structured JSON, the router skill, and MCP tools.

Keep the human path calm. Keep the agent path powerful. Both paths must use the
same core report logic and return the same evidence.

`CLAUDE.md` must stay a symlink to this file. Do not maintain separate copies of
agent instructions.

## Product Direction

- The product is local first. Do not add a required hosted backend, account,
  database, job queue, or telemetry service.
- Reports, tokens, project profiles, and caches stay on the user's machine.
- Optional research providers extend first-party evidence with keyword,
  result, domain, competitor, and link estimates. They must never replace or
  silently blend with Search Console, Google Analytics, crawl, or live result
  evidence.
- A future hosted API or remote MCP may live in this monorepo and deploy to
  Cloudflare, but local CLI and library use must remain first class.
- Report accuracy, deterministic output, and simple onboarding matter more than
  adding another surface or speculative score.
- The moat is the `seo` package, product quality, verified OAuth app, test
  corpus, report depth, brand, and release velocity. Do not hide core report
  logic behind private packages.
- The license is Apache-2.0. Brand and trademark rules belong in a separate
  public policy, not in code-level restrictions.

## Public Package Contract

The repository is a monorepo internally, but users install one package:

```txt
seo package     core TypeScript API
seo/mcp         stdio MCP server API
bin: seo        executable CLI command
skills/         packaged agent skills
```

- Do not publish or teach `@seo/core`, `@seo/cli`, or `@seo/mcp`.
- The root `package.json`, `tsdown.config.ts`, and `scripts/package.test.mjs` own
  the public package contract.
- Runtime bundles must not depend on private workspace package names.
- Keep Node 22 or newer as the supported runtime unless the whole repository is
  deliberately migrated and verified.
- The product name is SEO as a wordmark, `seo` as the command and package,
  and SEO Skill when prose truly needs a name; see PRODUCT.md's Name
  section. Speak of the skill in the singular; plural "skills" survives
  only in ecosystem names like the `skills/` directory and `npx skills
  add`. Prose defaults to benefit-first copy that does not name the product
  at all. The tagline is "The SEO command for AI agents". Do not use
  "SEO Skills CLI" or "SEO CLI" in new copy; they survive only as JSON-LD
  alternate names.
- Teach `npm i -g seo`, then `seo start`, as the primary README path.
- Library and contributor setup belongs below normal CLI usage in the README.

## Repo Map

- `packages/core`: report logic, storage, providers, Search Console/Google Analytics clients,
  fetch/extract, crawling, analysis, workflows, and renderers.
- `packages/cli`: `seo` command, prompt flows, command help, selection, and
  terminal output.
- `packages/mcp`: local stdio MCP server exposing core analysis.
- `apps/web`: static Astro documentation and landing site for seoskill.dev.
- `skills/seo/SKILL.md`: the single router skill agents install. It teaches
  discovery, the jobs table, and evidence rules; per-report depth lives in the
  registry.
- `evals/`: behaviour evals keyed by report id or job, shipped in the package.
- `scripts`: package, release, quality, OAuth injection, and local utilities.
- `docs`: git-ignored local notes, audit evidence, and working material.
- Working plans live in the git-ignored `docs/plans/` directory. Never depend
  on local docs or plans for product behavior or durable context.
- `dist`: generated public package bundles. Do not hand-edit or commit them.

Changes anywhere under `apps/web` must also follow `apps/web/AGENTS.md`. Read
that file before inspecting, editing, or generating site code or copy.

Useful web areas:

- `apps/web/src/layouts/BaseLayout.astro`: canonical SEO, metadata, header, and
  footer contract.
- `apps/web/src/pages`: landing, docs, policy wrappers, and the custom 404.
- `apps/web/scripts/build-sitemap.mjs`: exact static sitemap generation.
- `apps/web/AGENTS.md`: site content, design, and deployment rules.

Useful CLI areas:

- `packages/cli/src/index.ts`: root command registration and curated help.
- `packages/cli/src/args.ts`: shared argument parsing, including `projectArg`.
- `packages/cli/src/selection.ts`: project, site, and Google Analytics selection.
- `packages/cli/src/commands/setup`: `seo start` and guided onboarding.
- `packages/cli/src/commands/mcp-clients.ts`: MCP client paths and detection.
- `packages/cli/src/commands/mcp-config.ts`: safe MCP install and removal.
- `packages/cli/src/commands/report-catalog.ts`: schema-driven report discovery and execution.
- `packages/cli/src/commands/workflows/diagnose-property.ts`: `seo report`.
- `packages/cli/src/commands/report-options.ts`: shared report flags.

Useful core areas:

- `packages/core/src/analyze/reports`: narrative report assembly.
- `packages/core/src/analyze/workflows`: focused agent workflow reports.
- `packages/core/src/analyze/crawler`: crawl analysis and readiness reports.
- `packages/core/src/extract`: page and structured-data extraction.
- `packages/core/src/export`: CSV and export rendering.
- `packages/core/src/providers`: provider-neutral research contracts and
  provider-specific adapters. Keep provider-native metrics named and typed.
- `packages/core/src/links`: Bing, file and live-provider link evidence plus
  saved-crawl and Search Console target joins.
- `packages/core/src/gsc`: Search Console provider boundary.
- `packages/core/src/ga4`: Google Analytics Data/Admin API adapter. Keep `ga4`
  naming inside this implementation boundary only. Product commands, config,
  report fields, MCP inputs, docs, and UI use `googleAnalytics` or “Google
  Analytics”.

## Product Rules

- `seo start` is the human onboarding entry point.
- `seo report` is the main report. Run it first, explain gaps, then recommend a
  small number of follow-up commands.
- `seo help` and `seo --help` must stay short. Put the full inventory under
  `seo help all` and focused subcommand help.
- Every command and subcommand needs a useful `meta.description`.
- Saved site profiles are project profiles in user-facing copy.
- `--project` is the primary saved-profile selector.
- `--client` is a legacy alias. Keep it working, but never teach it in new
  output or docs.
- Commands must work without a profile when given the required `--site` or
  `--url` input.
- JSON mode is for agents and scripts. It must never prompt or contain terminal
  decoration.
- Interactive prompts are for humans only. Check TTY and CI state before
  prompting.
- Sparse data should skip the affected section with a clear reason. It should
  not fail unrelated sections or become a false zero.
- Bad auth, invalid selection, corrupt provider data, and errors that invalidate
  all output must still fail clearly.

## Onboarding Rules

The guided flow should not ask humans for implementation details.

- Ask for a project name, not an internal id.
- Derive stable ids automatically.
- Explain project profiles in one short sentence.
- Default to saving a profile, but allow profile-free use with `--site`.
- Discover Search Console and Google Analytics choices after sign-in. Do not expect users to
  copy property ids if the provider can list them.
- Keep advanced OAuth, service-account, quota, and cache choices out of the
  default path.
- A service-account auth path may be added as an advanced option, but do not
  document it as available until the implementation and provider tests exist.
- Printed next steps should start with `seo report --project <id>`.
- Shared desktop OAuth credentials are build or release inputs. Never commit
  production secrets or generated credential modules.
- Installed-app client values are identifiers, not a substitute for protecting
  refresh tokens. Local token files must keep private permissions.

## MCP Rules

- Keep `seo mcp install` interactive for humans. Require explicit targets in
  JSON and CI mode.
- Preserve unrelated client settings, create backups, and refuse to replace
  unmanaged `seo` entries.
- Use the native Codex CLI for its TOML config. Do not rewrite that file with
  string replacement.
- Keep platform paths covered by tests, especially Claude Desktop on Windows.

## Report Truth Rules

Every report must be technically defensible and useful to another program.

- Preserve observed evidence separately from derived findings and actions.
- Keep local query wording, searcher location, Google Analytics geography,
  exact SERP location, Maps results, and business-profile evidence separate.
  None can stand in for another.
- Label heuristics as heuristics. Do not turn conventions, correlations, or
  arbitrary thresholds into search-engine requirements.
- Do not claim causation, ranking impact, indexing, crawler access, rich-result
  eligibility, or AI visibility unless the evidence supports that exact claim.
- Treat intentional controls such as `noindex`, canonicals, robots rules, and
  snippet limits as observations until intent or contradictory evidence makes
  them defects.
- Keep zero, missing, unavailable, invalid, filtered, partial, capped, and
  complete states distinct.
- Provider row limits, sampling, pagination, failed subqueries, invalid rows,
  and retained subsets must remain visible in structured provenance.
- Keep provider-indexed AI mention datasets, fixed live prompt observations,
  referral analytics, and technical eligibility as separate evidence types.
  Never present one as proof of another.
- A capped or partial source cannot support a definitive zero or all-clear.
- Treat each fixed AI prompt response as one observation under its exact prompt,
  provider, requested and effective model, market label, settings, and time. It
  is not a universal visibility score or assistant ranking.
- Keep provider base-price estimates separate from exact task costs returned
  after completion. Cached observations, changed models, partial answers, and
  truncated answers cannot support before-and-after claims.
- GSC final-data dates use the `America/Los_Angeles` calendar and the shared
  final-data helper. Do not recreate date windows with naive UTC subtraction.
- Aggregate duplicate provider rows deterministically before ranking or
  limiting results.
- Use stable codepoint tie-breakers so input order never changes output.
- Keep analysis dates, thresholds, limits, units, source semantics, and schema
  versions in JSON where an agent needs them to interpret a result.
- Report skipped sections in terminal output, JSON, Markdown, and narrative
  caveats.
- Recommend evidence-backed verification steps. Do not invent traffic, click,
  revenue, or ranking forecasts.
- Add regression fixtures for false positives, false negatives, partial data,
  malformed provider rows, boundary values, and deterministic ordering.

## Architecture And Code Style

- TypeScript ESM only.
- Keep CLI and MCP wrappers thin. Reusable behavior belongs in `packages/core`.
- Register structured reports once so CLI discovery, MCP discovery, and skills stay in sync.
- Prefer structured APIs and schemas over string parsing.
- Prefer small modules with one clear responsibility. Split files when a real
  boundary appears; do not create abstract layers that only rename calls.
- Remove real duplication, but do not merge reports that need different source
  semantics or provenance.
- Keep terminal output concise and action oriented.
- Keep provider-neutral report and storage contracts inside the package.
  Provider adapters map external fields, capabilities, costs, and errors at the
  boundary. A report must not expose a provider payload or require a
  provider-named implementation type.
- Use ASCII unless the file already needs non-ASCII text.
- Keep dependencies lean. Prefer a small, tested local implementation when the
  behavior is stable and importing a package would add more surface than value.
- Do not leave warnings, ignored errors, disabled tests, or unexplained
  pre-existing failures behind.
- Preserve unrelated user changes in a dirty worktree.

## Skills And MCP

The package ships exactly one skill, the router at `skills/seo/SKILL.md`. Do
not add per-report skills. Per-report guidance lives in the registry depth
tables (`packages/mcp/src/report-depth*.ts`) and is served at runtime by
`seo reports describe` and `seo_describe_report`.

- Follow the format rules in `skills/README.md`.
- A new report registers once with its schema and depth guidance (readOrder,
  doNotClaim, verify, related); no skill file is added for it.
- Keep the router description broad enough to trigger on any SEO-adjacent
  request, and keep its body under roughly a thousand words.
- Teach agents to start compact, inspect evidence, then request detail through
  describe.
- Behaviour evals live in `evals/` (see `evals/README.md`) and are validated
  by `scripts/validate-skills.mjs`.
- Skills and MCP must call the same core functions as the CLI.
- Keep the MCP discovery surface compact. Avoid exposing dozens of near-identical
  tools when discovery plus a report id can cover them cleanly.
- New reports must use the existing list, describe, and run tools. Do not add a
  report-specific public MCP tool unless the product contract explicitly changes.
- Define new reports directly in the shared registry. Do not register a fake MCP
  tool only to capture its schema and handler for discovery.
- Bound inputs and outputs. Large pages, issue inventories, and raw provider
  rows should be opt-in.
- Preserve structured error and report schemas across CLI and MCP surfaces.

## Project Selection

When a command can use a saved profile:

1. Add `project` with description `Saved project id or name.`
2. Add `client` with description `Legacy alias for --project.`
3. Resolve both with `projectArg(args)`.
4. Pass the result as `client` to existing internal selection APIs until core
   types are renamed.
5. Print and document `--project`, never `--client`.

If both flags are passed with different values, fail clearly.

## Development Commands

Run these from the repository root:

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm pack --dry-run
pnpm outdated --recursive
```

The unqualified `seo` command on this machine is deliberately the globally
installed npm release. Use it from outside the repository when checking the
published user experience. Never use it to validate uncommitted source changes,
and do not replace it with `npm link`, `pnpm link`, or a repository shim.

For local development, build the root public package and invoke its entry point
explicitly:

```sh
pnpm build:package
node dist/cli.js <command>
```

Do not add a separate `seo-local` command. Keeping the local invocation explicit
prevents published-package tests and development tests from being confused.

Use `pnpm exec biome format <files> --write` after edits. Avoid unrelated
formatting churn.

For public-package and CLI smoke tests, use the built root entries:

```sh
node dist/cli.js help
node dist/cli.js report --help
node dist/cli.js start --dry-run
node dist/cli.js report --project keep --json
node dist/cli.js mcp serve --test
```

After changing commands, sweep at least:

```sh
node dist/cli.js help
node dist/cli.js help all
node dist/cli.js report --help
node dist/cli.js projects --help
node dist/cli.js start --help
```

Root help must keep this curated path:

- `seo start`
- `seo report`
- `seo projects list`
- `seo refresh-priorities`
- `seo quick-wins`
- `seo second-page`
- `seo technical-watch`

Do not let `seo help` return `Unknown command help`.

## Performance And Local Resource Safety

Every implementation that fetches, iterates, stores, joins, or serializes data
whose size depends on a site or provider must define its resource bounds before
it is considered complete.

- Test realistic large fixtures as well as small correctness fixtures. A path
  that works for ten pages or rows is not evidence that it works for ten
  thousand.
- Bound network acquisition before downloading work. Limits applied only after
  every sitemap, page, provider row, or response body has been loaded do not
  count as limits.
- Keep peak memory tied to the active worker window, not total crawl or provider
  size. Prefer streaming, bounded queues, incremental aggregation, and
  disk-backed intermediate state over retaining whole datasets in memory.
- Avoid nested full-dataset scans. Add a deterministic operation-count or
  scaling regression test for algorithms that process large row sets; do not
  rely only on flaky wall-clock assertions.
- Define disk ownership and retention for every new cache, snapshot, report,
  log, or temporary artifact. Tests must cover cleanup and the maximum expected
  database or filesystem growth.
- Enforce one total structured-output budget for agent-facing reports. Per-list
  limits are insufficient when an envelope contains several bounded lists.
- For crawl, provider, export, or report changes with material scale risk, run
  the repository resource harness against a representative large fixture and
  record peak RSS, elapsed time, bytes read or written, and output size in the
  verification evidence.
- Treat unexplained superlinear CPU growth, memory that rises with completed
  work, acquisition beyond a stated limit, or unbounded disk growth as a
  release blocker.

Performance checks supplement the four repository gates below; they do not
replace correctness tests.

## Verification And Commits

Record every product or CLI issue discovered during development in the local
`docs/known-issues.md` log as soon as there is reproducible evidence. Keep the
original observation, update its status instead of deleting it, and add the
fix commit plus verification evidence when it is resolved. This log is local
working material and must not be committed.

Every implementation slice needs proportionate tests plus all four repository
gates before it is considered finished:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

- Fix warnings as part of the slice.
- Run focused tests while iterating, then the full gate before committing.
- Run `pnpm pack --dry-run` and package contract tests for packaging changes.
- Run the help sweep for command changes.
- Use focused conventional commits with type, optional scope, and imperative
  subject.
- Do not mix generated output, unrelated formatting, or separate report fixes
  into one commit.

## Local Auth And Security

The checkout may not include production shared OAuth credentials. For local
auth testing use one of:

- `seo auth setup-client`
- `SEO_GOOGLE_CLIENT_ID`
- `SEO_GOOGLE_CLIENT_SECRET`
- legacy `GSC_CLIENT_ID`
- legacy `GSC_CLIENT_SECRET`

Never commit OAuth tokens, shared client secrets, local config or cache files,
private keys, a populated generated credential module, provider payloads, or
real site data. Keep examples fake and safe for a public repository.

The release workflow injects the shared desktop client into the package build.
It requires the `SEO_GOOGLE_CLIENT_ID` and `SEO_GOOGLE_CLIENT_SECRET` GitHub
Actions secrets. The tracked generated module must contain `undefined`
placeholders between release builds.

npm publishing uses GitHub Actions trusted publishing from `release.yml`. Do
not add an `NPM_TOKEN`; the Google OAuth build secrets and npm OIDC identity are
separate concerns.

Before a public release:

- Run all repository gates and `pnpm pack --dry-run`.
- Inspect the tarball file list and install it in a clean temporary directory.
- Verify the CLI, root library export, `seo/mcp`, and packaged skills.
- Run dependency and secret scans defined by the repository.
- Confirm workflows do not expose release credentials to untrusted pull
  requests.
- Confirm the README, changelog or release notes, license, security policy, and
  trademark policy match the shipped package.
