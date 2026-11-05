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
- **Sites:** with the weekly site audit, add a site by picking one of
  the Search Console properties your linked Google accounts can read, see
  what each audited site is doing now (its Google account, last and next
  crawl, today's index checks and coverage, this week's drops and returns,
  subfolder properties, alerts), and remove it. Without it, and once
  Stripe is set up, the tab offers the paid plan instead,
- **Beta:** only on an account granted a beta feature, the features it can
  try, and alert settings,
- delete everything, which also revokes the Google sign-ins, or sign out.

An account in the weekly-audit beta also gets a `weekly-audit` section in
`seo_report` for the sites it audits, with what is new, back or resolved
since the crawl before. Its `seo_index` answers at once from the site's
stored URL Inspection results, which the server keeps up to date in the
background with each property's full 2,000 checks a day: its top pages
(lost clicks, then clicks, then impressions, up to 1,000) daily, the rest
as often as the quota allows, and a page the crawl saw change at once. It
lists the URLs that dropped out of or came back to Google's index this
week first, as does the weekly-audit section, and says how many URLs are
covered, how many are queued and the time left. A site it asks about that
is not audited yet is added, which starts its crawl and checks. `seo_page`
uses a stored result while it is current. Every other account sees the tools
unchanged.

For an audited site, `seo_report` with section `issues` also keeps the
issues list (`packages/core/src/commands/issues.ts`) in D1's `site_issues`,
one row per account and property, deleted with the site or the account.
For any other site the section stores nothing and returns the list as JSON
for the agent to save and pass back as `saved`. An issue marked fixed whose
subject is a page, or a query on a page, gets Search Console clicks,
impressions and position for the 28 and 56 days from the day it was marked
fixed (Search Console's calendar) against the same days before, once final
data covers them: one call per issue, at most 20 a run, kept on the issue.
The Monday summary measures what is due first (at most 20 calls an
account) and lists the results whose days after ended in the latest 7 days
of final data.

## Paid plan

The weekly site audit is $50 a month per site (`src/billing.ts`), with
nothing to set: the plan is the sites you audit. Without a plan, picking a
site on the Sites tab opens Stripe Checkout for that one site, and the
webhook adds it once the plan is active. With a plan, adding a site past
the limit raises the subscription by one site, charged at once for the
rest of the month (a card that fails refuses it), and removing one lowers
it from the next bill, never below one site. Manage billing opens Stripe's
customer portal for the card, invoices and cancelling. Agents get the same
path from `seo_sites` with `add`: it starts the site, grows a paid plan by
one site, or returns the Checkout link for the person to open. Stripe posts
`customer.subscription.created`, `.updated` and `.deleted` to
`POST /account/billing/webhook`, which checks the `Stripe-Signature` and
keeps one `billing` row per account. An active, trialing or past-due plan
grants `weekly-audit` like the beta flag; the site limit is the beta's 5
free sites plus the sites paid for, and over the limit only the oldest
sites keep running. Each account has one open Checkout session at a time: a new link expires
the older one, and a paid one waiting for the webhook says the plan is
starting, so nobody pays twice. A maintainer's own account can get the `unlimited-sites` flag
(`pnpm --filter @seo/hosted-mcp beta grant <google email> unlimited-sites`),
which runs the audit on up to 100 sites with no plan. Delete everything expires an open Checkout
and cancels the subscription first.
Billing stays off until `STRIPE_PRICE_ID`, `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are all set.

## Competitor check

Paid sites (and `unlimited-sites` accounts) get a weekly competitor check
(`src/audit/competitors.ts`) on SEO Skill's own DataForSEO account, never
the person's saved keys. The site page lists the competitors: DataForSEO's
suggestions until the person saves their own, with no count limit. Each
week it refreshes the competitors whose keywords are older than 28 days,
stalest first, then names at most 3 keywords that pass every gate: two
competitors in the top 10, commercial or transactional intent with a CPC
(a free tool needs a competitor tool page ranking for three paying
keywords), no Search Console impressions on the site, a fit with the site
from a TypeSafe classification, and at least 3 of the live top 10 at or
below the site's Domain Rating plus 10. A keyword is named once unless it
grows 50% stronger. Spend is capped before each call at $1.50 a run and $5
a site a month, and metered as `included_dataforseo_microusd`. The result
goes to the weekly summary through `audit_sites.opportunities`. The check
stays off until `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` are set, and
names nothing without `TYPESAFE_API_KEY`.

## Internal linking tool page

The site's `/tools/internal-linking-tool` page runs the internal links
report (the same core code as `seo internal-links`) in the cloud for a
signed-in account. The page's "Sign in with Google" form posts to
`/account/signin` with `next`, which brings the person back with the
account cookie. Then `GET /account/tools/internal-links?property=` returns
the plan, runs left today, the latest run and its result, and
`POST /account/tools/internal-links` with `{"property": ...}` starts a run.
A POST needs a same-origin `Origin` or `Sec-Fetch-Site`, and both need a
Search Console property one of the person's linked Google accounts can
read (verified, not `siteUnverifiedUser`), so nobody can point the crawler
at a site they do not control. The defaults sit in
`INTERNAL_LINKS_LIMITS` (`src/tool-internal-links.ts`), mirrored for the
page's copy in `apps/web/src/lib/internal-links-tool.ts`:

- free, any account: up to 100 pages, 3 runs a day per account, counted
  in D1 `usage` as `internal_links_free_runs` (UTC days),
- a site in the account's weekly audit (within its site limit): up to
  5,000 pages, 3 runs a day per site, counted in the site's object.

Each run is one `InternalLinks` SQLite Durable Object per person and
property (`src/internal-links/run.ts`). Alarm wakes of up to a minute
crawl as SEOSkillBot with the weekly audit's user agent, honouring
robots.txt and its crawl delay (as the CLI does, a delay cuts the crawl to
about 15 minutes), at most 4 requests at once and 4 a second, from the
sitemaps or by following links, inside the property's origin and path.
No JavaScript rendering. Each page's links, top terms and linkable
sentences are written to SQLite as it lands; then up to 150 linked URLs
are followed to see where they redirect, and the report runs with Jev on
SEO Skill's `TYPESAFE_API_KEY` (text matching without it) and up to 50,000
Search Console query rows for shared searches. The crawl tables are
dropped once the result is saved; the trimmed result (up to 300 links and
200 orphan and weak pages, with full counts) is kept 24 hours, then the
alarm deletes the object's storage. Pages crawled and the Jev spend go to
`usage` as `internal_links_pages` and `included_typesafe_microusd`. The
MCP tools still send agents to the CLI for internal links.

## Alerts

An account in the weekly-audit beta gets alerts without asking: once a day,
one roundup of the pages on all its sites that dropped out of Google's index
(a top page's drop only after a second check agrees) or got into it. It goes
out after the Search Console day's checks are done, early morning UTC, and
only when something changed. On Monday it goes in the weekly summary
instead. Under Alerts on the Beta tab, each
alert type has its own email and webhook switch; both are on by default, and
the webhook only once a URL is saved. Email goes to the first linked Google
account from `alerts@e.seoskill.dev`, through PostShiba, at most 550 a day
for all accounts; the rest wait for the next day and say so. Every email has
a link that turns that type's email off.

### Alert webhooks

A webhook URL must be `https://` on a public host name. Each alert is one
`POST` with a JSON body, signed the
[Standard Webhooks](https://www.standardwebhooks.com/) way:

- `webhook-id`: the alert id, the same on every retry, so you can drop
  repeats,
- `webhook-timestamp`: seconds since 1970,
- `webhook-signature`: `v1,` and the base64 HMAC-SHA256 of
  `<id>.<timestamp>.<body>`, keyed with the bytes of the signing secret
  after its `whsec_` prefix (base64). The secret is on the Beta tab.

Answer with any 2xx within 10 seconds. A timeout, 408, 429 or 5xx is tried
again up to 6 times over about a day. Redirects are not followed, and any
other answer stops that alert. The Beta tab shows the last call's result.

```json
{
  "id": "alt_0f4c2a9e8b7d4c1fa3e5b6c7d8e9f001",
  "type": "index-changes",
  "site": null,
  "created_at": "2026-10-22T08:17:03.000Z",
  "data": {
    "sites": [
      {
        "property": "sc-domain:example.com",
        "dropped": 1,
        "returned": 1,
        "pages": [
          {
            "url": "https://example.com/pricing",
            "change": "dropped",
            "at": "2026-10-21T14:16:58.000Z",
            "verdict": "NEUTRAL",
            "coverage": "Crawled - currently not indexed"
          },
          {
            "url": "https://example.com/blog/guide",
            "change": "returned",
            "at": "2026-10-21T19:17:01.000Z",
            "verdict": "PASS",
            "coverage": "Submitted and indexed"
          }
        ]
      }
    ]
  }
}
```

`type` says what `data` holds. `index-changes` is the daily roundup, so
`site` is `null`; `data.sites` lists only the sites with changes. Each lists
up to 100 pages, drops first; `dropped` and `returned` count them all. A
`returned` page is indexed now and was not on its last check, which
includes a new page indexed for the first time. `verdict` and `coverage`
are Google's own words.

`weekly-summary` goes out on Monday morning (07:17 UTC in summer, 08:17 in
winter, once the Pacific Sunday is over) for the week from the
Monday before to Sunday. It covers every audited site, so `site` is `null`.
`data` is what `seo report` and `seo_report` summarise with no site: `start` and `end`, and per
site `property`, `link`, `crawl` (the last finished crawl, with `new_issues`
first seen or back that week), `index` (the week's `checked`, `dropped` and
`returned`, with up to 5 `dropped_pages`) and `clicks` (the latest 7 days
of final Search Console data against the 7 before). Each is `null` when it
is not known yet. `index_changes` is Monday's daily roundup, the same
list as `index-changes` `data.sites`, empty when nothing changed.

`google-update` goes out within the hour of Google's
[Search Status Dashboard](https://status.search.google.com/) posting that a
ranking update (a core, spam or similar update) started rolling out, and
again when it says the update finished: once per phase and account,
covering every audited site, so `site` is `null`. Only updates that started,
or finished, in the last 7 days are sent; an account first alerted after an
update finished gets only `finished`. `data.update` has Google's `id` and
`name`, `phase` (`started` or `finished`), `start`, `end` (`null` while it
rolls out) and `url` (Google's notice); `data.sites` lists the account's
audited properties.

More types may come; ignore one you do not know.

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
| `seo_index` | Google's indexing reasons for 100 known URLs a run, checked live and labelled, and pages that lost most of their clicks |
| `seo_research` | Keyword metrics, ranked keywords, SERPs, competitors and backlinks from DataForSEO or Ahrefs, with a free Ahrefs Domain Rating column |
| `seo_data` | Raw Search Console rows, search landing pages from Google Analytics, or Clicky visits by landing page with traffic sources and search engines. |
| `seo_lint` | Checks copy sent as text (up to 200,000 characters) for patterns common in AI-written text, weak copy and title and description length, with a fix for each finding and a list of lines to judge. Reads no account data. |

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
- beta features granted to the account, and when (`beta_flags`). Only a
  maintainer grants or revokes one, with
  `pnpm --filter @seo/hosted-mcp beta grant <google email> <flag>` (or
  `revoke`, or `list`); nothing on the account page or in the tools can.
  `src/beta.ts` names the flags, and `betaFlags()` is the one check.
- for the weekly-audit beta only: the properties an account audits and
  their schedule and last summary (`audit_sites`), and, in one SQLite
  Durable Object per account and property (`SiteAudit`, `src/audit`), the
  last two crawls' pages, findings with their first-seen and resolved dates,
  52 run summaries, and the site's one store of URL Inspection results
  (`src/audit/checks.ts`) with each page's Search Console clicks and
  impressions and today's inspection count per property. Once a day the
  object pushes the site's coverage to D1 (`audit_sites.coverage`): checks
  a day, its properties and the folders worth adding as URL-prefix
  properties. Removing the site, or Delete everything, deletes the object's
  storage. Pages whose titles, canonicals or links need JavaScript are
  rendered with Cloudflare Browser Run (`src/audit/render.ts`), decided
  per section (first folder, or / for top-level pages): two pages of each
  section are compared raw and rendered, and if they differ every HTML
  page of that section is rendered, keeping the raw values that changed.
  The answer is kept for 28 days (`render_sections`); until then a section
  that reads the same raw renders only pages with warning signs (no title,
  under 50 words, no internal links, or 100 KB of mostly script).
- metered use (`usage`, `src/usage.ts`): one amount per account, UTC day
  and kind: Browser Run time and pages, URL Inspection checks and
  `seo_research` calls by provider. No URLs or content. A site object
  holds its share in its `unmetered` table until it reaches D1. Metering
  only; nothing limits or charges an account from it.
- for the paid plan: the Stripe customer and subscription ids, the open
  Checkout session's id, the subscription status and number of sites
  (`billing`). Card details stay
  with Stripe.
- for alerts (`src/alerts`): each alert type's email and webhook switches,
  the webhook URL and its sealed signing secret (`alert_settings`), each
  alert with its site, changed URLs and delivery state for 30 days
  (`alerts`), and alert emails sent and held per day (`alert_email_days`).
  Every alert email uses one plain layout (`src/alerts/email.ts`), HTML and
  text drawn from the same Markdown, with no tracking. The Monday weekly
  summary (`src/audit/week.ts`) records each account's week for 90 days
  (`weekly_summaries`) so it is sent once.
- for the Sites tab: after each run of a site's index checks, its object
  pushes counts to D1 (`audit_sites.monitor`): checks used today, pages
  known, covered, indexed and waiting, the newest and oldest check, and
  this week's drops and returns. A site's page, `/account/sites/<id>`, uses
  a short hash of the person and the property as its id, so the link never
  shows the domain. The picker's property list comes from one bounded
  `sites.list` call per linked Google account and is held only in the
  Worker's memory for 5 minutes (`src/audit/choices.ts`).
- for "Create these in Search Console" on the Sites tab
  (`src/audit/properties.ts`): only when clicked, an incremental Google
  sign-in for the Search Console write scope with online access, so no
  refresh token is issued; the access token adds each folder with
  `sites.add`, reads back whether it is verified, and is dropped. A folder
  under a domain property the person owns is verified by the parent's
  method; one that is not shows "added, not verified".
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

Outside the weekly-audit beta there are no reports, Search Console or
analytics rows, site lists or request logs. Workers Logs are off. Read sign-ups as totals only with
`pnpm --filter @seo/hosted-mcp run signups` (by day, path, client, referring
site, landing page and `utm_*`). A weekly cron sends the same kind of
totals for the last 7 days to the maintainer's Telegram chat when
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set (`src/signup-report.ts`);
it never sends a row for one person. The site's public `/api/stats` shows
the same groupings for every sign-up so far, with any value held by fewer
than three sign-ups counted as Other (`apps/web/worker/discovery.ts`). The same cron reads the site's
anonymous usage events (the `seo-telemetry` D1, SELECT only) and sends the
week's failed runs as totals by version, split into expected states, network
or provider trouble and errors, plus the week's installs and first audits
and day 7 retention by install week (`src/failure-report.ts`). **Delete everything** on the account page
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
