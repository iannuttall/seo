# Cloudflare deployment

The site is a static Astro build. Astro writes the HTML pages, Markdown alternates, discovery files, and response-header rules into `apps/web/dist`. Cloudflare serves those files as Workers Static Assets. There is no application Worker or Astro middleware running for normal page requests.

## Git build settings

Use these settings for the `seo-skill` Worker. Changing `name` in Wrangler creates another Worker instead of renaming the current one, so keep this value stable after the project has been created.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root (leave blank) |
| Build command | `pnpm build:web` |
| Deploy command | `pnpm deploy:web` |
| Non-production deploy command | `pnpm --filter @seo/web exec wrangler versions upload` |

The root `.node-version` file pins Node `22.20.0`. The build command includes the `@seo/astro` workspace dependency, so a clean Cloudflare build does not try to load that package before it exists.

The Wrangler config declares both custom domains:

- `seoskill.dev`
- `www.seoskill.dev`

The dashboard Redirect Rule should keep sending `www.seoskill.dev` to the apex domain with a permanent `301` response. Keep **Always Use HTTPS** enabled for the zone so plain HTTP requests also reach the canonical HTTPS URL.

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
(http.host eq "seoskill.dev" and http.request.uri.path ne "/" and not ends_with(http.request.uri.path, "/") and not ends_with(http.request.uri.path, ".md") and (http.request.uri.path eq "/docs" or starts_with(http.request.uri.path, "/docs/") or http.request.uri.path in {"/cookies" "/privacy" "/security" "/terms" "/trademarks"}) and (lower(http.request.headers["accept"][0]) eq "text/markdown" or starts_with(lower(http.request.headers["accept"][0]), "text/markdown,")))
```

Set **Path** to **Rewrite to Dynamic** with this expression:

```txt
concat(http.request.uri.path, ".md")
```

Leave the query string unchanged.

The `.md` exclusion is required because explicit Markdown requests also send `Accept: text/markdown`. Without it Cloudflare rewrites `/docs/skill.md` to `/docs/skill.md.md` and returns the 404 page.

The `Accept` check is deliberately strict. It handles the normal agent header and a Markdown-first media list, while `Accept: text/markdown;q=0` stays on the HTML page. A broad `contains "text/markdown"` rule would incorrectly serve Markdown when the client explicitly gave it a quality value of zero.

## Response headers

`apps/web/public/_headers` contains the shared security, discovery, caching, and content-policy headers. The build then appends the exact Markdown token estimate and canonical link for each generated `.md` file.

Cloudflare applies `_headers` directly to static asset responses. Do not move these headers into a Worker unless the site later gains a real runtime feature.

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

The negotiated and explicit Markdown requests should return `Content-Type: text/markdown`, the same token estimate, and the same bytes. The `q=0` request should return HTML. Both `www` and plain HTTP should return a permanent redirect to the apex HTTPS URL.

Cloudflare documents the underlying features in its [URL Rewrite Rules](https://developers.cloudflare.com/rules/transform/url-rewrite/) and [Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/) guides.
