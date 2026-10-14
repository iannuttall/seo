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
use your own key. There are two ways to give a key, and neither puts it in a
chat:

1. **On the sign-in page.** Open "Add your own API keys" before you continue
   with Google. The keys are sealed into the sign-in your agent keeps. To
   change them, connect again. This works in every client.
2. **As headers** in the client config. A header wins over a sealed key.

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

Keep header values in your shell environment or keychain, not in a file in a
repository.

## Tools

| Tool | What it returns |
| --- | --- |
| `seo_sites` | Search Console and Google Analytics properties, and which keys arrived |
| `seo_report` | The main report. Without a section: the overview plus each section's count and top rows. Sections: overview, quick-wins, low-ctr, striking-distance, second-page, content-decay, cannibalization, traffic-drop. Page sections check their top 20 URLs live and merge same-site redirects. |
| `seo_page` | One URL: live page facts, Google index status and its queries against the previous period |
| `seo_compare` | Equal periods before and after a date, for the site or URLs that contain some text, with Google updates |
| `seo_index` | Pages that lost most of their clicks, checked live and with URL Inspection |
| `seo_research` | Keyword metrics, ranked keywords, SERPs, competitors and backlinks from DataForSEO, Ahrefs or Semrush, with a free Ahrefs Domain Rating column |
| `seo_data` | Raw Search Console rows, or landing pages from Google Analytics, Clicky, Fathom, Simple Analytics or Plausible |

Reports run the same `@seo/core` code as the CLI, through
`@seo/core/hosted`. Advice fields are removed before the agent sees them.
Each tool takes its target and optional dates, nothing more. Start with the
summary; ask for `rows` or `full` only when you need more. Each result names
the tool to run next.

Domain Rating comes from the free Ahrefs endpoint with the server's key
(`AHREFS_DR_KEY`), or the caller's Ahrefs key when they send one. It appears
only as a column next to other research data, with "Domain Rating by Ahrefs".

## What is stored

Nothing. There is no database, account or log of your data.

- The client id, sign-in state, code and tokens are values sealed with
  AES-GCM under `SEAL_KEY`. Your MCP client keeps them. The access token holds
  a Google access token; the refresh token holds the Google refresh token.
- Provider keys are sealed into those same tokens, or arrive as headers on
  each request. They are used for that request only and never saved.
- Remove access at any time in your
  [Google account](https://myaccount.google.com/connections).

## Develop

```sh
cp .dev.vars.example .dev.vars   # fill in a Google web client and a SEAL_KEY
pnpm --filter @seo/hosted-mcp dev
pnpm --filter @seo/hosted-mcp typecheck
```

Deploy with `pnpm --filter @seo/hosted-mcp deploy`. Production secrets
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SEAL_KEY`, `AHREFS_DR_KEY`) live in
`.dev.vars.production`; upload them with
`wrangler deploy --secrets-file .dev.vars.production`. A new `SEAL_KEY`
signs everyone out. Set `PUBLIC_URL` in `wrangler.jsonc` to move the server,
for example to `https://ian.is/seo`, and add `<PUBLIC_URL>/oauth/callback` to
the Google client's redirect URIs.
