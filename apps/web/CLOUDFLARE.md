# Cloudflare deployment

The site is a static Astro build with one small Cloudflare Worker in front of its assets. Astro writes the HTML pages, Markdown alternates, discovery files, and response-header rules into `apps/web/dist`. The Worker handles telemetry, public stats, bounded URL-fetching tools, and protected provider checks under `/api`, then sends every other request to the static assets binding.

Anonymous telemetry events go to a dedicated D1 database through a Worker binding. The Worker validates a fixed schema, does not read request IP or location fields, and has invocation logging disabled. The public stats endpoint queries aggregate counts through the same binding and caches its response at the edge for one hour.

Every Worker-backed tool uses a SQLite-backed `PaidToolGuard` Durable Object for an exact allowance of ten checks per network and tool each UTC day. It stores daily HMAC identities rather than raw IP addresses and deletes each day's object after 48 hours. Native rate-limit bindings reject bursts before the Worker starts expensive fetch work. Provider-backed forms also validate Turnstile, and separate provider budgets cap the number of Ahrefs, DataForSEO Spam Score, and DataForSEO traffic requests even when clients rotate networks.

## Git build settings

Use these settings for the `seo-skill` Worker. Changing `name` in Wrangler creates another Worker instead of renaming the current one, so keep this value stable after the project has been created.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root (leave blank) |
| Build command | `pnpm build:web` |
| Deploy command | `pnpm deploy:web` |
| Non-production deploy command | `pnpm --filter @seo/web exec wrangler versions upload` |

The root `.node-version` file pins Node `22.20.0`. Agent markdown comes from the published `@iannuttall/seo-graph-astro` package. The integration's per-file Cloudflare headers are disabled because they grow by one rule for every page. The tracked `_headers` file uses bounded wildcard rules instead.

The Wrangler config declares both custom domains:

- `seoskill.dev`
- `www.seoskill.dev`

The dashboard Redirect Rule should keep sending `www.seoskill.dev` to the apex domain with a permanent `301` response. Keep **Always Use HTTPS** enabled for the zone so plain HTTP requests also reach the canonical HTTPS URL.

## D1 setup

The `TELEMETRY_DB` binding and `seo-telemetry` database are declared in `wrangler.jsonc`. Reads and writes use the binding directly, so the Worker does not need a Cloudflare API token or secret.

The deploy command applies tracked migrations before it deploys the Worker. To apply them without deploying, run:

```sh
pnpm --filter @seo/web exec wrangler d1 migrations apply seo-telemetry --remote
```

For local Worker development, apply the same migration to Wrangler's local D1 database:

```sh
pnpm --filter @seo/web exec wrangler d1 migrations apply seo-telemetry --local
```

Regenerate isolated Worker types after changing bindings:

```sh
pnpm --filter @seo/web types:worker
```

## Provider tool secrets

Production values live only in the ignored `apps/web/.dev.vars.production`
file. Start from `.dev.vars.production.example`, fill every required production
value, then preview which secrets will be published:

```sh
cp apps/web/.dev.vars.production.example apps/web/.dev.vars.production
pnpm --filter @seo/web secrets:publish:dry-run
pnpm --filter @seo/web secrets:publish
```

The production file is the local recovery source for every required Worker
secret. The publisher compares `env-manifest.json` with the remote `seo-skill`
Worker and adds only missing required secrets. Existing values are left alone.
Pass `--all` only when every listed remote value should be replaced from the
local file. Use `--only NAME` to rotate one named secret from the file.

Check the production contract without publishing anything:

```sh
pnpm secrets:web:check
pnpm secrets:web:check-local
```

The first command checks remote secret names and is safe for Cloudflare's build
environment, where ignored local files do not exist. The second also validates
the complete local recovery file. Remote values remain unreadable through
Wrangler.

The production deploy command runs the remote check before migrations or
deployment, so Cloudflare's deployment pipeline stops when a required remote
secret name is missing.

Install the tracked local Git hooks once in each checkout or Conductor
workspace:

```sh
pnpm hooks:install
```

The pre-commit hook validates both the local recovery file and remote secret
names whenever staged changes touch the web app, its lockfile, or the hook
itself. It uses the local Wrangler login, so no Cloudflare API token or GitHub
Actions secret is required. If Wrangler is not authenticated, a local value is
missing, or a required remote secret name is missing, the commit stops with an
actionable error. Git hooks can be bypassed with `--no-verify`, so the deploy
check remains the final remote enforcement point.

The public Turnstile site key is an Astro build input rather than a secret.
Put it in the ignored `apps/web/.env.production` file for local production
builds and set the same build variable in the Cloudflare project:

```sh
PUBLIC_TURNSTILE_SITE_KEY=your-site-key
```

The global daily provider limits are non-secret Wrangler variables. The
tracked defaults allow 500 free Ahrefs checks, 100 DataForSEO Spam Score
checks, and 10 DataForSEO traffic checks per UTC day. Change the limits in
`wrangler.jsonc` when the provider budget changes. A limit can tighten during a
day but cannot widen until the next UTC day.

For local review, copy `.dev.vars.example` to the ignored `.dev.vars` file.
The preview command removes the Turnstile widget and uses a localhost-only
bypass token. The same command overrides `LOCAL_TOOL_PREVIEW` to `true` for the
local Worker. Its tracked production value is `false`, so production requests
still require normal Turnstile verification.

```sh
pnpm --filter @seo/web preview:cloudflare
```

## Durable Object cost guardrails

`PaidToolGuard` performs no provider requests, alarms with external work,
WebSocket work, or row scans. A provider reservation has a runtime ceiling of
seven SQL statements, while a public fetch reservation uses no more than four.
Its reads use primary keys with `LIMIT 1`, writes touch at most one identity
row and one provider row, and the cleanup alarm only removes the small daily
object after 48 hours. Burst limits run before every reservation. Turnstile
runs before provider reservations.

Create a low Cloudflare billing budget alert for the `ian.is` account and
monitor the `PaidToolGuard` request, duration, and row-read metrics after
deployment. Cloudflare budget alerts are account-wide notifications based on
processed usage. They are useful warnings, but they are not hard spending
limits and usage may take time to appear. See Cloudflare's
[billing budget alert announcement](https://developers.cloudflare.com/changelog/post/2026-06-04-billable-usage-product-sidebar/).

## Route Markdown requests at the edge

The build creates a static `.md` file for every canonical content page. These two URL Rewrite Rules let an agent request the normal page URL with `Accept: text/markdown` and receive that prebuilt file.

In Cloudflare open **Rules**, then **Transform Rules**, then **URL Rewrite Rules**. Create the root rule before the content rule.

Use the Expression Editor for both filters. Cloudflare's visual expression builder cannot represent these rules and will offer to discard them if you switch back. Cancel that prompt and keep the custom expression.

### Rewrite the home page to its Markdown file

Use this rule expression:

```txt
(http.host eq "seoskill.dev" and http.request.uri.path eq "/" and (lower(http.request.headers["accept"][0]) eq "text/markdown" or starts_with(lower(http.request.headers["accept"][0]), "text/markdown,")))
```

Set **Path** to **Rewrite to Static** with this value:

```txt
/index.md
```

Leave the query string unchanged.

### Rewrite content pages to their Markdown files

Use this rule expression:

```txt
(http.host eq "seoskill.dev" and http.request.uri.path ne "/" and not ends_with(http.request.uri.path, "/") and not (http.request.uri.path contains ".") and not starts_with(http.request.uri.path, "/api/") and (lower(http.request.headers["accept"][0]) eq "text/markdown" or starts_with(lower(http.request.headers["accept"][0]), "text/markdown,")))
```

Set **Path** to **Rewrite to Dynamic** with this expression:

```txt
concat(http.request.uri.path, ".md")
```

Leave the query string unchanged.

The rule is deliberately deterministic rather than a path allowlist: every
extensionless page path negotiates automatically, so new pages are covered
the moment the build emits their `.md` twin, with no rule edit. The
`contains "."` exclusion keeps every file-extension asset out — including
explicit `.md` requests, which also send `Accept: text/markdown` and would
otherwise be rewritten to `.md.md` and 404. `/api/` is excluded so the
Worker's telemetry routes are never rewritten. A page without a generated
`.md` twin returns the 404 page for Markdown requests; that only happens
for paths that are already 404 in HTML.

The `Accept` check is deliberately strict. It handles the normal agent header and a Markdown-first media list, while `Accept: text/markdown;q=0` stays on the HTML page. A broad `contains "text/markdown"` rule would incorrectly serve Markdown when the client explicitly gave it a quality value of zero.

## Response headers

`apps/web/public/_headers` contains the shared security, discovery, caching, and content-policy headers. A small set of wildcard rules gives every generated `.md` file the Markdown content type and canonical link. This keeps the file below Cloudflare's 100-rule limit as the report catalog grows.

Exact token estimates remain available in `agent-routes.json`. They do not need a separate response-header rule for every page.

Cloudflare applies `_headers` directly to static asset responses returned through the assets binding. The API routes set their own minimal JSON security and cache headers in the Worker.

## Check the deployed site

Run these requests after each deployment:

```sh
curl -sS -D - https://seoskill.dev/docs/skill -o /dev/null
curl -sS -D - https://seoskill.dev/docs/skill \
  -H 'Accept: text/markdown' -o /dev/null
curl -sS -D - https://seoskill.dev/docs/skill.md -o /dev/null
curl -sS -D - https://seoskill.dev/docs/skill \
  -H 'Accept: text/markdown;q=0' -o /dev/null
curl -sS -I https://www.seoskill.dev/docs/skill
curl -sS -I http://seoskill.dev/docs/skill
```

The negotiated and explicit Markdown requests should return `Content-Type: text/markdown` and the same bytes. The `q=0` request should return HTML. Both `www` and plain HTTP should return a permanent redirect to the apex HTTPS URL.

Cloudflare documents the underlying features in its [URL Rewrite Rules](https://developers.cloudflare.com/rules/transform/url-rewrite/) and [Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/) guides.
