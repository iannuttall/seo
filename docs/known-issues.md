# SEO CLI issue log

This file keeps reproducible product and CLI problems visible until they are
fixed and verified. Add an entry when a problem is observed. Update the same
entry with the cause, fix commit, and verification result instead of removing
it.

Each issue needs a status, observed date, affected version, evidence, impact,
and a verification step. Use `Open`, `Fixed`, or `Verified` for status.

## SEO-001: pnpm global install can omit the SQLite binding

- Status: Verified
- Observed: 2026-07-16
- Affected version: 0.2.5
- Environment: Node 24.3.0, pnpm 11.11.0, macOS arm64

### What failed

A global install completed and basic commands such as `seo --version`, project
listing, and setup checks worked. `seo report` crashed as soon as it opened the
local cache database because `better-sqlite3.node` was missing.

The failing command was:

```sh
seo report --site sc-domain:ian.is --url https://ian.is --full --refresh --json
```

The error reported that no `better-sqlite3` binding existed for Node ABI 137 on
darwin arm64.

### Impact

The install appears healthy until a database-backed report runs. Crawls,
provider caches, monitoring reports, and other commands that use the local
SQLite store can fail before returning evidence.

### Cause and fix

pnpm blocked the transitive native build script during the global install.
Version 0.2.7 replaces `better-sqlite3` with the script-free `libsql` package
shape and keeps the existing synchronous database contract behind a local
adapter.

- Fix commit: `8ac0a36`

### Verification

The packed 0.2.7 package installed globally with pnpm and `--ignore-scripts`,
then `seo cache stats` opened the database successfully.

## SEO-002: setup-check does not verify the local database

- Status: Verified
- Observed: 2026-07-16
- Affected version: 0.2.5

### What failed

`setup-check` returned `ok: true` immediately before `seo report` failed to load
the SQLite binding. Its checks cover configuration, Google login, scopes, and
saved defaults, but they do not open the local database.

### Impact

An agent can report that setup is ready even though the main report cannot run.

### Cause and fix

`setup-check` now opens the local database and runs `SELECT 1` before reporting
that setup is ready. A failed check tells the user to upgrade or reinstall the
CLI and links to the issue tracker if it persists.

- Fix commit: `8ac0a36`

### Verification

The doctor test injects an unavailable SQLite runtime and confirms the report
returns `ok: false` with a failed `local-database` check and repair action.

## SEO-003: installed-package tests do not open the database

- Status: Verified
- Observed: 2026-07-16
- Affected version: 0.2.5

### What failed

The packed-package smoke tests install with npm and exercise version output,
dry-run setup, help, MCP discovery, and library imports. None of those paths
opens the database, so the published package passed while a main report could
still crash on first use.

### Impact

Release checks do not cover a required runtime dependency on the main user
path.

### Cause and fix

The isolated install tests now run `seo cache stats` after npm global, pnpm
global, and npm consumer installs. The pnpm case disables lifecycle scripts to
prove the published package does not depend on them.

- Fix commit: `8ac0a36`

### Verification

`pnpm test:package-install` passed all three install cases and opened the local
database in each relevant runtime.

## SEO-004: libsql query rows expose driver metadata

- Status: Verified
- Observed: 2026-07-16
- Affected version: 0.2.7 development

### What failed

The first `better-sqlite3` replacement used the compatible `libsql` API
directly. Every selected row included an enumerable `_metadata` property with
driver timing data. Three URL Inspection quota tests failed because the query
result shape had changed.

### Impact

Driver internals could leak into stored or exported report objects whenever a
database row is spread or serialized.

### Cause and fix

The `libsql` compatibility layer includes query timing metadata in each row.
The local SQLite adapter removes that property at the storage boundary so the
rest of the CLI retains its existing database contract.

- Fix commit: `8ac0a36`

### Verification

All 675 core tests pass. A dedicated adapter test confirms selected rows
contain only declared columns, and the quota tests preserve their exact prior
shape.

## SEO-005: the local cache can grow beyond one gigabyte

- Status: Open
- Observed: 2026-07-16
- Affected version: 0.2.5

### What failed

`seo cache stats` reported a 1511.7 MB local database with 17,520 HTTP cache
rows. The CLI still opened it, but this is too large for a cache users never
need to manage during normal onboarding.

### Impact

Long-running installations can consume substantial disk space and may pay
unnecessary database and backup costs.

### Cause and fix

The HTTP cache stores response bodies and expiration controls whether a row is
reused, but no verified size or age retention policy keeps the database
bounded. The cache needs automatic pruning with a conservative limit, plus
database compaction that does not interrupt active reports.

### Verification

Seed expired and oversized HTTP cache data, run the normal cache lifecycle,
and confirm retained rows and file size stay inside the documented bounds.

## SEO-006: report summaries do not inflect singular counts

- Status: Open
- Observed: 2026-07-16
- Affected version: 0.2.7

### What failed

The second-page report returned phrases including `1 eligible average-position
pages found`, `1 are returned`, and `1 query/page candidate have`. The report
uses plural nouns and verbs even when a count is exactly one.

### Impact

Human and agent-facing summaries look unfinished even though the underlying
report data is correct.

### Cause and fix

The narrative templates interpolate counts without count-aware nouns and
verbs. Move repeated count grammar behind a small formatting helper and cover
both singular and plural output.

### Verification

Generate the second-page narrative with zero, one, and multiple eligible pages
and candidates, then assert each sentence uses the matching noun and verb.

## SEO-007: agent-readiness requires explicit Markdown mirrors

- Status: Verified
- Observed: 2026-07-16
- Affected version: 0.2.7
- Fixed in: 0.2.8
- Fix commit: `dea3714`

### What failed

`seo agent-readiness --url https://ian.is --refresh` reported five Markdown
representation failures because the pages did not advertise explicit Markdown
mirror URLs. Direct requests with `Accept: text/markdown` returned Cloudflare's
valid negotiated Markdown with `Vary: Accept`, token headers, stable bytes, and
the site's Content-Signal policy.

### Impact

Cloudflare Pro, Business, and Enterprise users with Markdown for Agents enabled
receive false failures and are told to build unnecessary mirrors. That makes
onboarding require knowledge of an implementation detail the platform already
handles.

### Cause and fix

Representation collection returned before making negotiated requests unless a
page advertised exactly one mirror. Collect negotiated Markdown independently,
repeat whichever representation is available, and accept negotiation-only
coverage when media type, `Vary: Accept`, q-values, stability, and quality all
verify.

### Verification

Run the focused readiness report against a fixture with no alternate link and a
valid negotiated Markdown response. Coverage, negotiation, determinism, token,
quality, and Content-Signal checks must pass without an explicit mirror.

The core fixture passed, and a fresh dogfood run against `ian.is` verified five
of five negotiated pages with zero representation failures.

## SEO-008: content profile requires software schema

- Status: Verified
- Observed: 2026-07-16
- Affected version: 0.2.7
- Fixed in: 0.2.8
- Fix commit: `dea3714`

### What failed

The focused agent-readiness report warned that the personal site `ian.is` was
missing a software identity even though it already had connected `WebSite`,
`Person`, `ProfilePage`, and page-level structured data.

### Impact

Publishers can be told to add an untruthful `SoftwareApplication` node to a
personal, editorial, or other content site just to clear the report.

### Cause and fix

The content-profile identity check required `SoftwareApplication` for every
site. Require a website, creator or publisher, and page identity; report
software as optional evidence and tell users to add it only when it is true.

### Verification

Run the identity check with `WebSite`, `Person`, and `WebPage` schema but no
`SoftwareApplication`. The content-profile identity check must pass.

The existing agent-readiness fixture now omits `SoftwareApplication` and keeps
the identity check passing.
