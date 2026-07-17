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

- Status: Verified
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

Expired rows were ignored on reads but never removed. The HTTP, Search Console,
Google Analytics, Semrush, and performance caches also had no shared storage
budget.

Disposable cached data now has a 256 MiB combined limit, split by provider, and
a maximum age of 30 days. Maintenance runs when the database opens and after
either 50 cache writes or 16 MiB of new cached data. It removes expired rows,
keeps the newest data inside each provider budget, and compacts free database
pages outside active report work. `seo cache stats` reports both the database
footprint and logical cached data against the automatic limit.

- Fix commits: `1658a01`, `9f7fe01`

### Verification

The storage tests seed expired and oversized cache data, verify newest-first
retention under the provider budgets, convert a legacy database to incremental
vacuum mode, and confirm the database file shrinks after cleanup.

The full build, typecheck, test, and lint gates pass. The built CLI reports an
empty cache as `0 B of 256.0 MB automatic limit`, and the public package
contract and dry-run pack checks pass.

## SEO-006: report summaries do not inflect singular counts

- Status: Verified
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

Several narrative templates interpolated counts without using the shared
count-aware noun and verb helpers. Second-page, striking-distance, quick-win,
and diagnosis summaries now use the same grammar path.

- Fix commit: `94701ec`

### Verification

The report tests generate zero, one, and multiple eligible pages and candidates
and assert each sentence uses the matching noun and verb.

The full build, typecheck, test, and lint gates pass.

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

## SEO-009: authorized-client test can exceed four minutes and flake the suite

- Status: Open
- Observed: 2026-07-17
- Affected version: 0.2.8
- Environment: Node 24.3.0, pnpm 11.11.0, macOS arm64

### What failed

`pnpm test` failed once in `@seo/core` with
`dist/gsc/auth/authorized-client.test.js` reporting
`'Promise resolution is still pending but the event loop has already
resolved'` after 51 seconds. Two later runs in the same window, one solo and
one on a clean `main` checkout, took over 120 and 248 seconds but passed.

Later the same day the file ran in 240ms solo, with every test between 1ms
and 204ms, and two deliberately concurrent instances each finished in 320ms.
The stall is intermittent and load-dependent, not inherent to the tests.

### Evidence so far

The suite mocks `fetch`, uses a per-process temp `SEO_CONFIG_DIR`, and holds
no cross-process resources, so the tests themselves have nothing minute-long
to wait on. The production code path they exercise does: `withFileLock`
(`packages/core/src/storage/lock.ts`) configures `proper-lockfile` with 60
retries backing off to 1 second (about 55 seconds to exhaust) and a 60 second
staleness window, and `proper-lockfile` routes filesystem calls through
`graceful-fs`, which parks operations in an in-process queue on `EMFILE`.
The observed 51 and 248 second durations sit on multiples of that retry
window, and every stall happened while parallel test fleets, builds, and a
live crawl were saturating the machine. The node:test diagnostic about a
pending promise with a resolved event loop matches an fs call parked by
`graceful-fs` with nothing left to wake it.

### Impact

The full test gate can fail or crawl for minutes with no product defect,
which hides real failures and slows every verification run.

### Mitigation

Both guard rails are in place. Every test in the file now carries a 10
second timeout, and the suite sets `SEO_LOCK_FAST=1`, which makes
`withFileLock` use a short retry and staleness schedule so a wedged lock
fails in about a second with a clear error. Production CLI runs are
untouched and keep the patient schedule that lets concurrent seo processes
wait for each other.

The stall itself has not recurred since, so the root cause remains
unconfirmed. If a timeout fires under the fast schedule, the error will now
say whether lock acquisition was the stage that stalled. Instrument
`withFileLock` with acquisition timing if more detail is needed then.

### Verification

Run `node --test dist/gsc/auth/authorized-client.test.js` in `packages/core`.
The file should finish in seconds and pass consistently under a parallel
`pnpm test` run.

## SEO-010: fetched response bodies can exceed local memory budgets

- Status: Verified
- Observed: 2026-07-17
- Affected version: 0.2.8

### What failed

Page, robots.txt, agent-resource, and Semrush responses were read into memory in
full. A server could return an unexpectedly large body before the cache policy
had any chance to limit it.

### Impact

A single bad response could cause a large memory spike, slow the machine, or
terminate a crawl even though the stored cache is bounded.

### Cause and fix

The shared fetch path had timeouts but no streaming byte limit. It now checks a
declared content length, counts streamed bytes, cancels the body when it crosses
the limit, and returns a specific size-limit error. HTML pages are capped at 5
MiB, robots.txt at 1 MiB, focused agent resources at 2 MiB, and Semrush
responses at 10 MiB.

- Fix commits: `9f7fe01`, `c82d6b9`

### Verification

The fetch tests cover bodies inside the limit, oversized declared lengths,
oversized streamed bodies, and an end-to-end page request rejected before it is
cached.

The full build, typecheck, test, and lint gates pass.

## SEO-011: crawl inputs can allocate excessive local work

- Status: Verified
- Observed: 2026-07-17
- Affected version: 0.2.8

### What failed

Library and some MCP crawl inputs accepted arbitrarily large page, depth, and
concurrency values. Final click-depth correction also rescanned the full link
graph once per page in the worst case.

### Impact

An accidental large value could create excessive network, memory, and CPU work
on the user's machine. Large crawls also spent avoidable CPU time recalculating
shortest link depths.

### Cause and fix

Core validation now caps a crawl at 10,000 pages, depth 64, concurrency 16, and
a 120 second per-request timeout. CLI help and MCP schemas expose the same
limits. Click depths now use one queue-based graph traversal, and recent-crawl
summary queries aggregate only the selected runs instead of scanning all saved
page and recommendation rows.

- Fix commits: `c82d6b9`, `1658a01`

### Verification

Core and MCP tests reject unsafe crawl inputs. A graph regression fixture
confirms shorter paths propagate in one traversal, and monitoring tests verify
the narrowed summary query returns the same evidence.

The full build, typecheck, test, and lint gates pass.

## SEO-012: automatic report histories can grow without retention

- Status: Verified
- Observed: 2026-07-17
- Affected version: 0.2.8

### What failed

Crawl monitoring, link recovery, index watch, and automatic technical baselines
kept adding database rows without a retention policy. Automatic baselines also
shared a table with reports users explicitly chose to save.

### Impact

Scheduled monitoring and repeated main reports could quietly grow the local
database long after older internal snapshots stopped being useful.

### Cause and fix

Crawl monitoring and link recovery now retain the latest 20 runs for each
scope. Index watch retains 20 attempts for each URL and preserves the latest
successful inspection when it is older. Automatic technical baselines are now
marked separately and retain two per site with a global limit of 50. Explicitly
saved crawl reports remain user-owned and are never removed by this cleanup.

- Fix commit: `1658a01`

### Verification

Storage tests insert histories beyond every limit and confirm old automatic
rows are removed with their dependent rows. Separate crawl-report tests confirm
automatic baselines stay bounded while an explicitly saved report remains
loadable.

The full build, typecheck, test, and lint gates pass.

## SEO-013: local log files have no retention policy

- Status: Verified
- Observed: 2026-07-17
- Affected version: 0.2.8

### What failed

Daily application logs and redirected schedule output could grow indefinitely.
The schedule generator kept appending to one file per job without cleanup.

### Impact

Long-running scheduled installs could quietly consume disk even after cache
retention was fixed.

### Cause and fix

Local logs now rotate at 8 MiB, expire after 14 days, and share a 64 MiB total
limit. Logger startup runs cleanup, scheduled cron lines prune before appending,
and `seo logs prune` provides the same operation for manual or scripted use.

- Fix commit: `1658a01`

### Verification

The log-retention test covers rotation, age deletion, and total-size pruning.
CLI smoke tests confirm quiet, human, and JSON cleanup modes and scheduled cron
output.

The full build, typecheck, test, and lint gates pass. The built CLI prints cron
entries that prune logs before appending to each scheduled output file.

## SEO-014: sitemap crawls require full page downloads

- Status: Verified
- Observed: 2026-07-17
- Affected version: 0.2.8

### What failed

Sitemap mode downloads, parses, and caches every retained page body before it
can report HTTP status or redirects. It cannot start from an explicit sitemap
URL, and CI has no JUnit output.

### Impact

Large sitemap checks do far more network, CPU, memory, and disk work than a
deploy health gate needs. Users must choose between an expensive full audit and
no sitemap-wide status evidence.

### Cause and fix

The existing sitemap path had no lighter execution strategy. It remains the
full audit, while `--health` now accepts an explicit sitemap URL and runs fresh
status and redirect probes without page parsing, rendering, provider joins,
external-link checks, or cache writes. Health crawls start with one request at
a time, increase gradually after clean response streaks, and return to one
after a network or access failure. JUnit output uses the same sitemap, status,
redirect, robots, network, and firewall evidence as JSON and human reports.

- Fix commit: `8f54c2f`

### Verification

Core tests cover explicit sitemap selection, status-only evidence, no content
rules, progressive concurrency, access blocks, redirect handling, and body
disposal. Export tests cover per-URL and sitemap JUnit failures. CLI and MCP
tests confirm the health-first inputs and structured output.

The full build, typecheck, test, and lint gates pass. The built help surfaces
put the health gate before the full crawl, skill validation passes, and the
public package dry run passes.

## SEO-015: crawler identity and access blocks are not actionable

- Status: Verified
- Observed: 2026-07-17
- Affected version: 0.2.8

### What failed

HTTP and browser-rendered requests use a generated desktop browser identity.
Robots evaluation uses that generated value too. Firewall and challenge
responses are recorded as ordinary HTTP errors without naming the crawler,
showing reliable provider evidence, or explaining how to grant narrow access.

### Impact

Site owners cannot reliably recognize the crawler in logs or configure a
stable exception. When a WAF blocks the audit, agents and humans receive a
generic status instead of the evidence needed to resolve access safely.

### Cause and fix

The HTTP client generated a browser identity independently of robots and report
output. Every HTTP and rendered request now uses
`SEO-Skill/<version> (+https://seoskill.dev)`, and robots.txt evaluation uses
the stable `SEO-Skill` token. Denied, rate-limited, and Cloudflare challenge
responses retain structured provider indicators, request ids when available,
the exact crawler identity, and narrow access guidance. Challenge bodies are
not parsed, rendered, or cached. Guidance warns that User-Agent values are
spoofable and requires any exception to be restricted by source IP, hostname
or path, and the blocking rule.

- Fix commit: `8f54c2f`

### Verification

HTTP, robots, plain-fetch, access-block, crawler-schema, report, JUnit, CLI, and
MCP tests cover stable identity and blocked-request evidence. Tests also
confirm Cloudflare infrastructure headers alone do not create a false block
and that confirmed challenge bodies do not enter the page cache.

The full build, typecheck, test, and lint gates pass. Skill, README, CLI help,
report guidance, and website documentation all expose the same identity and
safe access policy.
