# Hosted MCP

A free remote MCP server at `https://seoskill.dev/mcp`. It reads your own
Search Console and Google Analytics data, plus optional keyword and analytics
accounts, and returns facts. It gives no advice and stores nothing.

## Connect

Any MCP client that supports remote servers with OAuth:

```sh
claude mcp add --transport http seoskill https://seoskill.dev/mcp
codex mcp add seoskill --url https://seoskill.dev/mcp
```

Sign in with Google when the client asks. You need access to at least one
Search Console property.

## Keys

DataForSEO, Ahrefs, Semrush, Clicky, Fathom, Simple Analytics and Plausible
use your own key. Send it as a header in the client config, never in a chat:

| Provider | Headers |
| --- | --- |
| DataForSEO | `X-DataForSEO-Login`, `X-DataForSEO-Password` |
| Ahrefs | `X-Ahrefs-Key` |
| Semrush | `X-Semrush-Key` |
| Clicky | `X-Clicky-Sitekey` |
| Fathom | `X-Fathom-Key` |
| Simple Analytics | `X-Simple-Analytics-Key`, optional `X-Simple-Analytics-User-Id` |
| Plausible | `X-Plausible-Key` |

```sh
claude mcp add --transport http seoskill https://seoskill.dev/mcp \
  --header "X-Ahrefs-Key: ${AHREFS_API_KEY}"
```

Keep the values in your shell environment or keychain, not in a file in a
repository.

## Tools

| Tool | What it returns |
| --- | --- |
| `seo_sites` | Search Console and Google Analytics properties, and which key headers arrived |
| `seo_report` | quick-wins, low-ctr, striking-distance, second-page, content-decay, cannibalization, traffic-drop |
| `seo_search_console` | Raw rows for any dimensions, filters and dates, with a comparison period |
| `seo_inspect_url` | Google index status for up to 10 URLs |
| `seo_analytics` | Landing pages from Google Analytics, Clicky, Fathom, Simple Analytics or Plausible |
| `seo_research` | Keyword metrics, ranked keywords, SERPs and competitors from DataForSEO, Ahrefs or Semrush |

Reports run the same `@seo/core` code as the CLI, through
`@seo/core/hosted`. Advice fields are removed before the agent sees them.

## What is stored

Nothing. There is no database, account or log of your data.

- The client id, sign-in state, code and tokens are values sealed with
  AES-GCM under `SEAL_KEY`. Your MCP client keeps them. The access token holds
  a Google access token; the refresh token holds the Google refresh token.
- Provider keys arrive as headers on each request and are used for that
  request only.
- Remove access at any time in your
  [Google account](https://myaccount.google.com/connections).

## Develop

```sh
cp .dev.vars.example .dev.vars   # fill in a Google web client and a SEAL_KEY
pnpm --filter @seo/hosted-mcp dev
pnpm --filter @seo/hosted-mcp typecheck
```

Deploy with `pnpm --filter @seo/hosted-mcp deploy`. Production secrets
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SEAL_KEY`) live in
`.dev.vars.production`; upload them with
`wrangler deploy --secrets-file .dev.vars.production`. A new `SEAL_KEY`
signs everyone out. Set `PUBLIC_URL` in `wrangler.jsonc` to move the server,
for example to `https://ian.is/seo`, and add `<PUBLIC_URL>/oauth/callback` to
the Google client's redirect URIs.
