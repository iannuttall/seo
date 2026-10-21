# Hosted MCP

A free remote MCP server at `https://seoskill.dev/mcp`. It reads your own
Search Console, Google Analytics and Clicky data, plus optional keyword
accounts, and returns facts. It gives no advice. It keeps only your sign-ins,
saved keys and Clicky sites, encrypted, and never your data.

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

- **Accounts:** see your linked Google accounts and Bing, and add another,
- **Keys:** save or remove DataForSEO, Ahrefs and TypeSafe keys, a Clicky
  account login and Clicky sites (never shown again),
- **Machines:** approve a `seo login`, remove a linked machine, or make a
  token for a cloud agent,
- delete everything, which also revokes the Google sign-ins, or sign out.

Each tool call uses the linked Google account that can read the site, the one
with the most access. `seo_sites` lists properties from every linked account
with an account column. A `NO_ACCESS` error names the linked accounts and
links to the account page.

## Keys

DataForSEO and Ahrefs use your own key. A TypeSafe key
(`x-typesafe-key`) is never used by this server: a linked CLI gets it with
the other keys, and `seo internal-links` uses it on that machine to have Jev
classify pages and judge links. Clicky uses each site's site ID and
sitekey; saving one checks it with Clicky and records the site's domain from
one recent page, so `seo_data` can match the site by domain or site ID. Each
Clicky site is one key, `x-clicky-<site id>`. A saved Clicky account login
(`x-clicky-account`, `src/clicky.ts`) adds every site in the account, marked
as from the account. When `seo_data` asks for a Clicky site that is not
saved, the server reads the account's site list again (a linked CLI asks for
this with `/account/cli/credentials?clicky=refresh`). The login never leaves
the server. Other analytics tools run on your own machine with the `seo` CLI
and a provider package.

There are two ways to give a key, and neither puts it in a chat:

1. **On your account page.** Save the keys at `https://seoskill.dev/account`.
   They are encrypted and work in every client.
2. **As headers** in the client config. A header wins over a saved key and is
   used for that request only, which suits cloud agents and CI.

| Provider | Headers |
| --- | --- |
| DataForSEO | `X-DataForSEO-Login`, `X-DataForSEO-Password` |
| Ahrefs | `X-Ahrefs-Key` |
| Clicky | `X-Clicky-<site id>` with the sitekey |

```sh
claude mcp add --transport http seoskill https://seoskill.dev/mcp \
  --header "X-Ahrefs-Key: ${AHREFS_API_KEY}"
```

Keep header values in your shell environment or keychain, not in a file in a
repository.

## Tools

| Tool | What it returns |
| --- | --- |
| `seo_sites` | Search Console and Google Analytics properties from every linked Google account, which keys are set and the saved Clicky sites |
| `seo_report` | The main report. Without a section: the overview plus each section's count and top rows. Sections: overview, quick-wins, low-ctr, striking-distance, second-page, content-decay, cannibalization, traffic-drop. Page sections check their top 20 URLs live and merge same-site redirects. |
| `seo_page` | One URL: live page facts, Google index status and its queries against the previous period. The page's main content as Markdown is CLI and local server only; with detail `full` this server says how to get it. |
| `seo_compare` | Equal periods before and after a date, for the site or URLs that contain some text, with Google updates |
| `seo_index` | Pages that lost most of their clicks, checked live and with URL Inspection |
| `seo_research` | Keyword metrics, ranked keywords, SERPs, competitors and backlinks from DataForSEO or Ahrefs, with a free Ahrefs Domain Rating column |
| `seo_data` | Raw Search Console rows, search landing pages from Google Analytics, or Clicky visits by landing page with traffic sources and search engines. |

Bing Webmaster Tools runs only in the CLI and the local MCP server, because
Bing blocks this server's network. Bing is still linked here, on the account
page. A CLI linked to the account with `seo login` gets short-lived Bing and
Google tokens and the saved keys from `/account/cli/credentials` and calls
Bing and Google from its own machine (`src/cli.ts`). When an agent asks for
Bing, crawls or internal links, the server tells it to run `npx -y seo login`
and then the CLI command. Hosted Bing reports stay off through `HOSTED_BING`
in `src/tools/deps.ts`.

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
- each linked Bing account's tokens and a name made from its sites,
- your DataForSEO, Ahrefs and TypeSafe keys, if you save them,
- your Clicky sites, if you save them: site ID, sitekey and domain,
- your Clicky account login, if you save it: username and password, used
  only to read your Clicky site list,
- machines linked with `seo login` (a name from the host name and the date
  last used).
- how you signed up, written once when your person id is created: the path
  (MCP client, account page or `seo login`), the MCP client's name and user
  agent or the agent running the CLI, and, if you visited seoskill.dev first
  in that browser, the referring site's host name, the first page's path and
  any `utm_*` tags. These come from the site's `seo_first` cookie. No IP
  address, country or email (`migrations/0003_signup_sources.sql`,
  `src/signup.ts`).

Tokens and keys are sealed with AES-GCM under `SEAL_KEY` before they are
written. They are used only to fetch your own data when you ask. The token
your MCP client keeps, and the account page cookie, hold only your sealed
person id.

There are no reports, Search Console or analytics rows, site lists or
request logs. Workers Logs are off. Read sign-ups as totals only with
`pnpm --filter @seo/hosted-mcp run signups` (by day, path, client, referring
site, landing page and `utm_*`). A weekly cron sends the same kind of
totals for the last 7 days to the maintainer's Telegram chat when
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set (`src/signup-report.ts`);
it never sends a row for one person. The same cron reads the site's
anonymous usage events (the `seo-telemetry` D1, SELECT only) and sends the
week's failed runs as totals by version, split into expected states, network
or provider trouble and errors (`src/failure-report.ts`). **Delete everything** on the account page
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

The `seo-mcp` Worker deploys from `main` through Cloudflare's Git builds, like
the site. Merging a PR deploys it. Its build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root (leave blank) |
| Build command | `pnpm build:mcp` |
| Deploy command | `pnpm deploy:mcp` |
| Non-production branch builds | Off |

`pnpm deploy:mcp` applies new D1 migrations before it deploys, so a merged
migration reaches the database first. A deploy keeps the Worker's secrets
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SEAL_KEY`, `AHREFS_DR_KEY`,
`BING_CLIENT_ID`, `BING_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`). Set or change one with
`pnpm --filter @seo/hosted-mcp exec wrangler secret put <NAME>`. A new
`SEAL_KEY` signs everyone out and makes every stored token and key
unreadable. Set `PUBLIC_URL` in `wrangler.jsonc` to move the server,
for example to `https://example.com/seo`, and add `<PUBLIC_URL>/oauth/callback` to
the Google client's redirect URIs and `<PUBLIC_URL>/oauth/bing/callback` to
the Bing client's.
