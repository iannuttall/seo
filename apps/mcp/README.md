# Hosted MCP

A free remote MCP server at `https://seoskill.dev/mcp`. It reads your own
Search Console, Google Analytics and Bing Webmaster Tools data, plus optional
keyword accounts, and returns facts. It gives no advice. It keeps only your
sign-ins and saved keys, encrypted, and never your data.

## Connect

Any MCP client that supports remote servers with OAuth:

```sh
claude mcp add --transport http seoskill https://seoskill.dev/mcp
codex mcp add seoskill --url https://seoskill.dev/mcp
```

Sign in with Google when the client asks. You need access to at least one
Search Console property. That first Google account is your account; there is
no password or separate signup.

## Your account page

Sign in with Google at `https://seoskill.dev/account` to:

- see your linked Google accounts and add another one,
- connect Bing Webmaster Tools with Bing's own read-only sign-in,
- save or remove DataForSEO and Ahrefs keys (never shown again),
- delete everything, which also revokes the Google sign-ins, or sign out.

Each tool call uses the linked Google account that can read the site, the one
with the most access. `seo_sites` lists properties from every linked account
with an account column. A `NO_ACCESS` error names the linked accounts and
links to the account page.

## Keys

Clicky and other analytics run on your own machine with the `seo` CLI and a
provider package, so this server never needs their keys.


DataForSEO and Ahrefs use your own key. There are two ways to give a key,
and neither puts it in a chat:

1. **On your account page.** Save the keys at `https://seoskill.dev/account`.
   They are encrypted and work in every client.
2. **As headers** in the client config. A header wins over a saved key and is
   used for that request only, which suits cloud agents and CI.

| Provider | Headers |
| --- | --- |
| DataForSEO | `X-DataForSEO-Login`, `X-DataForSEO-Password` |
| Ahrefs | `X-Ahrefs-Key` |

```sh
claude mcp add --transport http seoskill https://seoskill.dev/mcp \
  --header "X-Ahrefs-Key: ${AHREFS_API_KEY}"
```

Keep header values in your shell environment or keychain, not in a file in a
repository.

## Tools

| Tool | What it returns |
| --- | --- |
| `seo_sites` | Search Console and Google Analytics properties from every linked Google account, the Bing site for each, Bing sites with no Search Console property, and which keys are set |
| `seo_report` | The main report. Without a section: the overview, Google and Bing clicks for the same dates, plus each section's count and top rows. Sections: overview, quick-wins, low-ctr, striking-distance, second-page, content-decay, cannibalization, traffic-drop, bing. Page sections check their top 20 URLs live and merge same-site redirects. |
| `seo_page` | One URL: live page facts, Google index status and its queries against the previous period |
| `seo_compare` | Equal periods before and after a date, for the site or URLs that contain some text, with Google updates |
| `seo_index` | Pages that lost most of their clicks, checked live and with URL Inspection |
| `seo_research` | Keyword metrics, ranked keywords, SERPs, competitors and backlinks from DataForSEO or Ahrefs, with a free Ahrefs Domain Rating column |
| `seo_data` | Raw Search Console rows, Bing query or page rows by week, or search landing pages from Google Analytics. Clicky and other analytics run locally with the CLI and a provider package. |

Bing and Google numbers sit side by side and are never added together. Bing
lists only its top queries and pages by week, so a row missing from Bing's
list is unknown, not zero.

Reports run the same `@seo/core` code as the CLI, through
`@seo/core/hosted`. Advice fields are removed before the agent sees them.
Each tool takes its target and optional dates, nothing more. Start with the
summary; ask for `rows` or `full` only when you need more. Each result names
the tool to run next.

Domain Rating comes from the free Ahrefs endpoint with the server's key
(`AHREFS_DR_KEY`), or the caller's Ahrefs key when they send one. It appears
only as a column next to other research data, with "Domain Rating by Ahrefs".

## What is stored

A small Cloudflare D1 database (`migrations/`) keeps only:

- a random person id, created at your first Google sign-in,
- each linked Google account's email and refresh and access tokens,
- your Bing sign-in tokens, if you connect Bing,
- your DataForSEO and Ahrefs keys, if you save them.

Tokens and keys are sealed with AES-GCM under `SEAL_KEY` before they are
written. They are used only to fetch your own data when you ask. The token
your MCP client keeps, and the account page cookie, hold only your sealed
person id.

There are no reports, Search Console, analytics or Bing rows, site lists or
request logs. Workers Logs are off. **Delete everything** on the account page
removes every row for you and revokes the Google sign-ins, so your agents
ask you to sign in again. You can also remove access in your
[Google account](https://myaccount.google.com/connections).

## Develop

```sh
cp .dev.vars.example .dev.vars   # fill in a Google web client and a SEAL_KEY
pnpm --filter @seo/hosted-mcp exec wrangler d1 migrations apply seo-mcp --local
pnpm --filter @seo/hosted-mcp dev
pnpm --filter @seo/hosted-mcp typecheck
```

Deploy with `pnpm --filter @seo/hosted-mcp deploy`. Production secrets
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SEAL_KEY`, `AHREFS_DR_KEY`,
`BING_CLIENT_ID`, `BING_CLIENT_SECRET`) live in
`.dev.vars.production`; upload them with
`wrangler deploy --secrets-file .dev.vars.production`. Apply new migrations
with `wrangler d1 migrations apply seo-mcp --remote` before deploying. A new
`SEAL_KEY` signs everyone out and makes every stored token and key
unreadable. Set `PUBLIC_URL` in `wrangler.jsonc` to move the server,
for example to `https://example.com/seo`, and add `<PUBLIC_URL>/oauth/callback` to
the Google client's redirect URIs and `<PUBLIC_URL>/oauth/bing/callback` to
the Bing client's.
