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
  database, job queue, or telemetry service. The optional hosted MCP keeps a
  small encrypted sign-in store (see MCP Rules); the CLI and library never
  need it.
- Tokens, provider keys, settings, and short-lived caches stay on the user's
  machine.
- The product is the data layer, the pipe. It fetches data and returns it.
  It does not save reports, history, projects, or decisions between runs, and
  it adds no command whose job is to keep them. The agent decides what to
  store and what to log. A crawl may hold what it needs while it runs.
- Optional research providers extend first-party evidence with keyword,
  result, domain, competitor, and link estimates. They must never replace or
  silently blend with Search Console, Google Analytics, crawl, or live result
  evidence.
- Optional provider packages may add analytics or research adapters through the
  public provider SDK. The main package owns the contracts, installation,
  credentials, resource limits, registry, report semantics, and provenance.
  Provider packages return normalized evidence and never add report findings,
  public commands, MCP tools, or skill files.
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

The repository is a monorepo internally. Users install one main package and
can add optional provider packages:

```txt
seo package     core TypeScript API
seo/mcp         stdio MCP server API
seo/provider-sdk provider package types and API version
bin: seo        executable CLI command
skills/         packaged agent skills
provider packages optional capability adapters
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
- Optional provider packages are maintained outside this repository. Keep
  provider-specific API clients and tests in their package repositories.
- `apps/web`: static Astro documentation and landing site for seoskill.dev.
- `skills/seo/SKILL.md`: the single router skill agents install. It teaches
  the eight commands, the report-first flow, the jobs table, and evidence
  rules.
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
- `packages/cli/src/args.ts`: shared argument parsing.
- `packages/cli/src/selection.ts`: the `--site` and Google Analytics property
  checks every command shares.
- `packages/cli/src/commands/setup`: `seo start`: Google sign-in, the MCP
  server, and the skill.
- `packages/cli/src/commands/mcp-clients.ts`: MCP client paths and detection.
- `packages/cli/src/commands/mcp-config.ts`: safe MCP install and removal.
- `packages/cli/src/commands/report-catalog.ts`: schema-driven report discovery and execution.
- `packages/cli/src/commands/core-commands.ts`: `seo report` and the other
  shared commands.
- `packages/cli/src/commands/report-options.ts`: shared report flags.

Useful core areas:

- `packages/core/src/commands`: the one engine for the eight commands and the
  MCP tools (`tools.ts`). Runs in Node and in Workers. Surfaces pass a
  `ToolSurface` (Google fetch, keys, sign-in hint); they add no report logic.
- `packages/core/src/google/api.ts`: every Search Console, URL Inspection and
  Google Analytics call, shared by the CLI, both MCP servers and any other
  host. The Node binding adds the local sign-in, cache and quotas.
- `packages/core/src/commands-node.ts`: the Node functions the CLI and local
  MCP pass to the commands.
- `packages/core/src/http/read-json.ts`: read every JSON API response through
  `readJson`, never `response.json()`.
- `packages/core/src/analyze/reports`: narrative report assembly.
- `packages/core/src/analyze/workflows`: focused agent workflow reports.
- `packages/core/src/analyze/crawler`: crawl analysis and readiness reports.
- `packages/core/src/extract`: page and structured-data extraction.
- `packages/core/src/export`: CSV and export rendering.
- `packages/core/src/providers`: provider-neutral research contracts and
  provider-specific adapters. Keep provider-native metrics named and typed.
- `packages/core/src/provider-extensions`: optional package manifests,
  npm package inspection, local installation, loading, registry, and the public
  provider SDK contract.
- `packages/core/src/bing/api.ts`: every Bing Webmaster Tools call, shared
  by the CLI, both MCP servers and any other host.
- `packages/core/src/commands/bing.ts`: Bing beside Search Console for the
  report's engines line, the `bing` section and `seo data --source bing`.
  Bing and Google numbers are never added together.
- `packages/core/src/gsc`: Search Console provider boundary.
- `packages/core/src/ga4`: Google Analytics Data/Admin API adapter. Keep `ga4`
  naming inside this implementation boundary only. Product commands, config,
  report fields, MCP inputs, docs, and UI use `googleAnalytics` or “Google
  Analytics”.
- `packages/core/src/clicky`: Clicky API adapter and sitekey storage boundary.
  Commands take the site ID. Keep sitekeys in the managed secret store.

## One Way To Run

Keep every report, tool and command simple and linear, for people and for
agents.

- A report needs only its target (site, URL or property) and, optionally, a
  date window. It returns everything it has.
- Do not add flags, options or environment switches that change what a
  report returns or means. Choices such as brand terms, minimums, page checks
  and redirect merges are automatic, deterministic and shown in the output.
- More detail comes only through progressive disclosure: summary, then rows,
  then every field.
- Each report may end by naming the report to run next. That is the only
  routing.
- When a new option seems necessary, first try to make the default right.

## Product Rules

- `seo start` is the human onboarding entry point.
- `seo report` is the main report. Run it first, explain gaps, then recommend a
  small number of follow-up commands.
- `seo help` and `seo --help` must stay short. Put the full inventory under
  `seo help all` and focused subcommand help.
- Every command and subcommand needs a useful `meta.description`.
- Every command takes its target each time: `--site` (a domain, URL, or
  `sc-domain:` property) or `--url`. Google Analytics commands take the
  numeric `--property`. Nothing picks a site from saved state or a prompt.
- A command run without its target fails with a message that says to pass
  `--site` and to run `seo sites` to list properties.
- `--project` and `--client` were removed. Both exit 2 with a notice.
- JSON mode is for agents and scripts. It must never prompt or contain terminal
  decoration.
- Interactive prompts are for humans only. Check TTY and CI state before
  prompting.
- Sparse data should skip the affected section with a clear reason. It should
  not fail unrelated sections or become a false zero.
- Bad auth, invalid selection, corrupt provider data, and errors that invalidate
  all output must still fail clearly.

## Onboarding Rules

`seo start` does three things, then stops:

1. Sign in with Google with the existing auth flow.
2. In an interactive terminal, offer to add an MCP server to the agents it
   detects. Recommend the free hosted server at `https://seoskill.dev/mcp`
   and offer the local `seo mcp serve` server. A client that cannot take a
   remote URL in its config file (Claude Desktop) gets the local server.
3. Offer to install the skill.

It then prints `seo sites`, then `seo report --site <site>`.

- Do not ask for a project, site, brand terms, crawl or watch URLs, analytics
  property, weekday, or any other setting. Do not save one.
- Do not add flags to `seo start` beyond `--json` and `--dry-run`. JSON and CI
  mode never prompt, never install anything, and fail clearly when Google
  sign-in is missing.
- Keep advanced OAuth, service-account, quota, and cache choices out of the
  default path.
- Optional provider packages are third-party code. Show the exact package,
  version, publisher, repository, integrity, and local-permission warning before
  installation. Package details are not a security audit or endorsement.
- Install only after explicit approval. JSON and CI mode require the npm
  package name and `--yes`; they never prompt or choose a package automatically.
- A service-account auth path may be added as an advanced option, but do not
  document it as available until the implementation and provider tests exist.
- Shared desktop OAuth credentials are build or release inputs. Never commit
  production secrets or generated credential modules.
- Installed-app client values are identifiers, not a substitute for protecting
  refresh tokens. Local token files must keep private permissions.

## MCP Rules

- There are two MCP servers with one tool set. The hosted server in
  `apps/mcp` (`https://seoskill.dev/mcp`) and the local stdio server in
  `packages/mcp` (`seo mcp serve`) both serve `seo_sites` and the shared
  tools defined once in `packages/core/src/commands/tools.ts`: `seo_report`,
  `seo_page`, `seo_compare`, `seo_index`, `seo_research` and `seo_data`.
- Each server only supplies a `ToolSurface`: how it reaches Google, resolves
  a site and reads provider keys. Tool names, inputs, descriptions and result
  text come from the shared definition, so both servers stay identical.
- Only the local server adds `seo_crawl`, `seo_internal_links` and the
  provider package tools (`seo_list_providers`, `seo_describe_provider`,
  `seo_run_provider`), because they need the person's machine.
- The hosted server keeps only a person id, the linked Google and Bing
  accounts, saved research keys and machines linked with `seo login`, sealed
  with `SEAL_KEY` in Cloudflare D1.
  It keeps no report data, provider rows, site lists or request logs, and
  Workers Logs stay off. The token the client keeps carries only the person
  id. Key headers win over saved keys and are used for that request only.
  The `/account` page links accounts, saves keys and deletes everything.
- Bing runs only in the CLI and the local server. Bing blocks the hosted
  server's network, so `HOSTED_BING` in `apps/mcp/src/tools/deps.ts` stays
  off. The account stays the one place for credentials: `seo login`
  (`packages/core/src/cloud.ts`) links a machine, which then gets
  short-lived Google and Bing tokens and the saved keys from the server and
  makes the calls itself. Nothing it fetches goes back to the server. The
  hosted server sends agents to `npx -y seo login` for Bing, crawls and
  internal links (`CLI_LINK`).
- Keep `seo mcp install` interactive for humans. Require explicit targets in
  JSON and CI mode.
- `seo start` adds the hosted server as an `mcpServers.seoskill` URL entry
  (Claude Code, Cursor) or with `codex mcp add seoskill --url` (Codex). It
  never replaces a `seoskill` entry that points somewhere else.
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
- Treat Clicky visitors as visit or session evidence only where Clicky's own
  definition supports that mapping. Do not invent Google Analytics users,
  conversions, attribution, or geography fields from Clicky rows.
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
- Local provider imports retain the provider, export date, file hash, included
  fields, encoding, delimiter, bytes read, file rows, supplied rows, valid
  rows, invalid rows, filtered historical rows, duplicates, and caps. An
  imported absence is never a definitive zero.
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
- Join optional Analytics geography to local search evidence only through an
  exact retained landing-page path. Never assign that geography to a Search
  Console query.
- Treat retained local-pack rows as observed listings and recurring organic
  domains as unclassified search competitors. Neither proves listing
  ownership, complete Maps coverage, or business equivalence.
- Normalize provider exports into shared internal types. Unfamiliar export
  fields use an explicit canonical column map that is validated and retained
  in provenance. Do not infer ambiguous mappings silently.
- Use stable codepoint tie-breakers so input order never changes output.
- Keep analysis dates, thresholds, limits, units, source semantics, and schema
  versions in JSON where an agent needs them to interpret a result.
- Report skipped sections in terminal output, JSON, Markdown, and narrative
  caveats.
- Recommend evidence-backed verification steps. Do not invent traffic, click,
  revenue, or ranking forecasts.
- When a report gets a real bug (a false positive, a false negative, partial
  data, a malformed provider row, unstable ordering), add one regression
  fixture for it.

## Architecture And Code Style

- TypeScript ESM only.
- Keep CLI and MCP wrappers thin. Reusable behavior belongs in `packages/core`.
- Define commands and MCP tools once in `packages/core/src/commands` so the CLI, both MCP servers, and the skill stay in sync.
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
- Load only explicitly installed provider packages declared in the local
  package registry. Do not scan global or project `node_modules` directories.
- Provider packages use the versioned `seo/provider-sdk` activation contract.
  Reject unknown API versions, undeclared entry points, traversal, duplicate
  provider ids, runtime dependency trees, and packages above the acquisition
  limit before executing their entry point.
- Use ASCII unless the file already needs non-ASCII text.
- Keep dependencies lean. Prefer a small, tested local implementation when the
  behavior is stable and importing a package would add more surface than value.
- Do not leave warnings, ignored errors, disabled tests, or unexplained
  pre-existing failures behind.
- Preserve unrelated user changes in a dirty worktree.

## Skills And MCP

The package ships exactly one skill, the router at `skills/seo/SKILL.md`. Do
not add per-report skills. The skill teaches the eight commands, the matching
MCP tools, the one-report flow and the evidence rules.

- Follow the format rules in `skills/README.md`.
- The public surface is eight commands (`seo report`, `seo page`,
  `seo compare`, `seo index`, `seo research`, `seo data`, `seo crawl`,
  `seo internal-links`) plus `seo start`. For the six shared commands, the
  CLI command in `packages/cli/src/commands/core-commands.ts` and the MCP
  tool in `packages/core/src/commands/tools.ts` call the same `run*`
  function in `packages/core/src/commands`, with the same result text. Crawl
  and internal links run the same core reports from the CLI and the local
  server.
- Add new analysis as a section of `seo report` or as part of an existing
  command first. A new command or MCP tool changes the product contract.
- Define a new MCP tool once in `packages/core/src/commands/tools.ts` so both
  servers serve it. Register a tool in only one server when it needs the
  local machine, such as a crawl.
- Do not bring back report discovery tools (`seo_list_reports`,
  `seo_describe_report`, `seo_run_report`). Each result ends with the command
  to run next; that is the only routing. `seo reports list`, `describe` and
  `run` stay in the CLI for the remaining catalog, served by the registry
  depth tables in `packages/mcp/src/report-depth*.ts`.
- Keep the router description broad enough to trigger on any SEO-adjacent
  request, and keep its body under roughly a thousand words.
- Teach agents to run the report without a section first, then one section,
  then the next command the result names. More detail comes from `rows` with
  an offset, then `full`.
- Behaviour evals live in `evals/`, one file per command, report section or
  job (see `evals/README.md`), and are validated by
  `scripts/validate-skills.mjs`.
- Bound inputs and outputs. Large pages, issue inventories, and raw provider
  rows should be opt-in.
- Preserve structured error and result shapes across the CLI and both MCP
  servers.

## Site Selection

Every command that reads Search Console takes `--site`, and page commands take
`--url`. Resolve them through `packages/cli/src/selection.ts`:

1. `requireSite` for the raw property, or `resolveProperty` to match a domain
   or URL to a property the sign-in can read.
2. `requireGoogleAnalyticsProperty` for Google Analytics commands.
3. Never fall back to saved state, a default site, or a prompt.

Old saved projects in an existing `config.json` are ignored and left in the
file. Do not read them.

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
node dist/cli.js report --json
node dist/cli.js mcp serve --test
```

After changing commands, sweep at least:

```sh
node dist/cli.js help
node dist/cli.js help all
node dist/cli.js report --help
node dist/cli.js sites --help
node dist/cli.js start --help
node dist/cli.js projects
```

Root help must keep this curated path: `seo start`, `seo report`, then the
eight commands (`seo page`, `seo compare`, `seo index`, `seo research`,
`seo data`, `seo crawl`, `seo internal-links`) and setup commands. Old report
names are not taught; they print their new command for one release
(`packages/cli/src/renames.ts`). Removed commands and flags, such as
`seo projects` and `--project`, exit 2 with a one-line notice from the same
file.

Do not let `seo help` return `Unknown command help`.

## Performance And Local Resource Safety

Every implementation that fetches, iterates, stores, joins, or serializes data
whose size depends on a site or provider must define its resource bounds before
it is considered complete.

- A path that works for ten pages or rows is not evidence that it works for
  ten thousand. Check scale with a realistic large input before release.
- Bound network acquisition before downloading work. Limits applied only after
  every sitemap, page, provider row, or response body has been loaded do not
  count as limits.
- Keep peak memory tied to the active worker window, not total crawl or provider
  size. Prefer streaming, bounded queues, incremental aggregation, and
  disk-backed intermediate state over retaining whole datasets in memory.
- Avoid nested full-dataset scans.
- Define disk ownership and retention for every new cache, snapshot, report,
  log, or temporary artifact.
- Enforce one total structured-output budget for agent-facing reports. Per-list
  limits are insufficient when an envelope contains several bounded lists.
- For crawl, provider, export, or report changes with material scale risk, run
  `pnpm test:resources` by hand. The resource harnesses are not part of CI.
- Treat unexplained superlinear CPU growth, memory that rises with completed
  work, acquisition beyond a stated limit, or unbounded disk growth as a
  release blocker.

## Verification And Commits

Record every product or CLI issue discovered during development in the local
`docs/known-issues.md` log as soon as there is reproducible evidence. Keep the
original observation, update its status instead of deleting it, and add the
fix commit plus verification evidence when it is resolved. This log is local
working material and must not be committed.

## Tests

Do not add a test unless Ian asks for it or it guards a real bug that hit a
user. When unsure, do not add one. Never test a switch, flag, message or
wiring.

Keep few tests, and make each one prove real behaviour. Prefer one test that
runs a whole command or report end to end over many tests of its helpers.

Write or keep a test only for:

- a command or report giving the right numbers and states from realistic
  input (zero, missing, partial and capped stay distinct; ordering is stable)
- parsing real HTML or real provider payloads
- security boundaries: OAuth, token sealing, token file permissions, provider
  package checks, secret redaction, safe MCP client config changes
- public contracts: CLI JSON, MCP tools, package install and exports, old
  seoskill.dev URLs
- a real bug that could come back

Do not write tests that check copy, help text, docs, workflow or config file
contents, constants, types, trivial helpers, or mocks calling mocks. When
behaviour changes, change the code and the few tests that prove it.

CI is one job named `checks` that runs build, typecheck, lint and test, and
it must stay fast and cheap (about two minutes). No browser tests, no
resource harnesses, no sleeps or network calls in tests, and no step that
repeats another (lint is Biome and the repo scripts; type checks run once).
Do not add CI jobs, test shards or scheduled workflows without Ian's
approval.

Every change passes all four repository gates before it is finished:

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
