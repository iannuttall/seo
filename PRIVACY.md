# Privacy policy

Last updated: 20 October 2026

This policy covers the official `seo` command-line tool, library, MCP server,
the hosted MCP server at seoskill.dev/mcp with its account page, and the
seoskill.dev website.

In short: the hosted MCP keeps only your linked Google and Bing accounts, any
API keys and Clicky sites you save and the machines you link, encrypted, so it can fetch your
own data when you ask. It never
keeps your Search Console or analytics data, your reports or a log of your
requests. When you first sign up it also notes how you found it: the
sign-in path, the agent or app, and the site that sent you there. The only
thing kept about your use is an anonymous usage count (the event, report,
agent, version and week).

The command-line tool runs on your machine. It does not create an SEO
account, upload reports to a hosted SEO service, or send reports or connected
account data to the project maintainer.

Local first describes where the software runs and stores its data. It does not
mean every command works offline. A command can make a direct request from your
machine to Google, a research provider, a site, or another service needed for
the work you requested. The sections below explain what each request can send.

## The hosted MCP server

The hosted MCP server at `https://seoskill.dev/mcp` runs the same reports
for an MCP client you connect to it. To do that it keeps a small store in
Cloudflare D1 with only these things:

- **A person id.** A random id created the first time you sign in with
  Google. That first Google account is your account. There is no password.
- **Your linked Google accounts.** The email address of each Google account
  you link, and its refresh and access tokens. You grant read-only access to
  Search Console and Google Analytics.
- **Your linked Bing account, if you link one.** Its refresh and access
  tokens, with read-only access to Bing Webmaster Tools, and a name made
  from its sites.
- **Your API keys, if you save them.** A DataForSEO login and password, an
  Ahrefs key and a TypeSafe key.
- **Your Clicky sites, if you save them.** Each site's numeric site ID,
  sitekey and domain. The domain comes from Clicky when you save the site,
  so agents can name the site.
- **Your Clicky account login, if you save it.** Your Clicky username or
  email and your Clicky password. Clicky has no other way to list an
  account's sites, so the server keeps the password, encrypted, and uses it
  only to read your Clicky site list: when you save it, and again when an
  agent asks for a Clicky site that is not saved yet. The password is never
  sent to a linked machine. Remove it on the account page, and change your
  password at Clicky if you want to be sure it no longer works.
- **Machines you link with `seo login`.** A name such as "seo on
  my-laptop", made from the machine's host name, and the date it was last
  used. A linked machine asks for short-lived Google and Bing tokens and your
  keys, and makes the Google and Bing requests itself. Nothing it fetches is
  sent back.
- **How you signed up.** Written once, when your person id is created, and
  never changed:
  - the way you signed up: an MCP client, the account page, or `seo login`;
  - the MCP client's name and its user agent, such as "Claude Code", or for
    `seo login` the agent running the CLI (when the CLI can tell and usage
    counts are on) and the CLI's user agent; for the account page, your
    browser's user agent;
  - if you visited the seoskill.dev website first in the same browser: the
    host name of the site that sent you (such as a search engine, never the
    full address), the first page you opened on seoskill.dev without its
    query string, and any `utm_source`, `utm_medium` and `utm_campaign` tags
    in that link.

  It holds no IP address, country or email address. It shows which paths
  bring people to SEO Skill, and it is counted only in totals. Once a week
  the server sends the maintainer those totals for the last seven days, such
  as sign-ups per path, agent, referring site and `utm_*` tag, through a
  Telegram message. The message never holds a row for one person.

Every token and key is encrypted with a server key before it is written. The
tokens are used only to fetch your own data when you or your agent ask for
it. The token your MCP client keeps carries only your person id.

The server keeps nothing else. It does not keep reports, Search Console
or Google Analytics rows, lists of your sites, or the pages it checked.
Request logs are turned off.

- **Your data.** Search Console, Google Analytics, Clicky and provider responses are
  fetched for each request, returned to your MCP client and not kept. Pages checked live are fetched for the request and not kept.
- **API key headers.** You can send `X-DataForSEO-Login`,
  `X-DataForSEO-Password` and `X-Ahrefs-Key` headers instead of saving keys.
  A header wins over a saved key and is used for that request only.
- **The account page.** At [seoskill.dev/account](https://seoskill.dev/account)
  you sign in with Google to see your linked accounts, keys and machines,
  add or remove them, approve a `seo login`, and make a token for a cloud
  agent. It sets one essential cookie that holds your
  encrypted person id for up to 30 days. The `seo_first` website cookie
  described below is read once, when you first sign up.
- **Outside services.** Google answers its own requests. The provider you
  choose receives your research request under its own policy. Clicky
  receives the site ID, sitekey, report types and dates for a Clicky request,
  and your Clicky username and password when the server reads your Clicky
  site list.
  Ahrefs receives the domains in research rows for the free Domain Rating
  column. Cloudflare runs the server, stores the encrypted data and handles
  the network requests.
- **Usage counts.** Each run sends one anonymous event to the same telemetry
  endpoint the CLI uses, with the event, report, agent, version and week. It
  never contains a site, URL, query, key, account or report data.

### Delete your hosted data

Sign in at [seoskill.dev/account](https://seoskill.dev/account) and choose
**Delete everything**. It deletes your person id, linked accounts, keys,
Clicky sites, linked machines and how you signed up,
and revokes the Google sign-ins. Your agents will ask you to sign in again if
you use the hosted server later. You can also revoke SEO Skill in your
[Google Account connections](https://myaccount.google.com/connections), which
stops the stored Google tokens working.

Your MCP client and its model provider receive the results under their own
terms.

## Google data the software can access

Google access is optional. If you connect an account, the software asks for
read-only access to:

- your Google account email address, so the local app can identify the account
  you connected;
- Search Console properties, performance data, and URL Inspection data you can
  already access; and
- Google Analytics accounts, properties, and report data you can already
  access.

The software uses this data to list properties, run the report you requested,
and join search or analytics evidence to crawl findings. It does not save
report history. It does not use Google data for advertising or to train
general-purpose AI models.

The shared desktop OAuth client identifies the `seo` app to Google. OAuth
tokens and API responses are returned to your machine, not to the project
maintainer.

The use of information received from Google APIs follows the [Google API
Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including its Limited Use requirements.

## Clicky data the software can access

Clicky access is optional. The hosted server and a CLI linked with
`seo login` use the Clicky sites saved on your account, as described above.
If you connect a site on your machine, the software sends its numeric
site ID, sitekey, requested report type, date range, and row limit directly to
Clicky over HTTPS. It can read the traffic data that sitekey permits. The
project maintainer does not receive the request or response.

The site ID is saved in the local configuration. The sitekey uses the operating
system keychain when available, with a private local file fallback. Agents and
CI can use `SEO_CLICKY_SITEKEY` without saving it. Clicky responses are cached
locally for up to 24 hours, and cache keys and cached responses do not contain
the sitekey.

## Bing data the software can access

Bing access is optional. In the command-line tool and local MCP server, you
save a Bing Webmaster API key with `seo providers bing connect`, or set
`SEO_BING_API_KEY`. The key is saved in the system keychain when available,
with a private local file fallback. Requests go directly from your machine to
Bing over HTTPS and can read the sites that key can read. Run
`seo providers bing disconnect` to remove the saved key. A machine linked
with `seo login` can instead use the Bing account linked on seoskill.dev:
the server hands it a short-lived token and the machine calls Bing directly.
The hosted MCP server itself does not read Bing data.

## How Google data is protected

The software stores settings, OAuth tokens, cached API responses, and logs in
local user directories. It does not save reports or crawls. It does not
upload Google API responses to a hosted SEO account or project database.
Google API requests go directly from your machine to Google over HTTPS. The
software does not send Search Console data to a research provider. `seo
research` sends only the keywords or target you give it.

OAuth tokens use the operating system keychain when that option is enabled.
The fallback token file and any bring-your-own OAuth client file are written
with user-only file permissions. Config, cache, and log directories are also
created with user-only permissions on supported systems. `seo privacy` prints
the relevant local paths and file permissions so you can inspect them.

The local cache is not a substitute for device security or disk encryption. A
person or process with access to your operating system account may be able to
read local reports and caches. You are responsible for the security of your
device, backups, shell history, exported reports, and any environment variables
you create.

## How long Google data is kept

OAuth tokens remain on your machine until you run `seo auth logout` or
`seo reset --yes`. Revoking SEO Skill from your Google Account invalidates the
grant. You should still run `seo auth logout` if you also want to remove the
local token record.

Google Analytics and Search Console API responses are cached locally so repeat
commands do not make the same request unnecessarily. A cached response is
eligible for reuse for up to 24 hours. Expired cache rows are removed during
automatic cache maintenance, which also removes cache rows older than 30 days
and enforces local size limits. On a machine where the command is no longer
run, expired rows may remain in the local cache file until you delete them.

Run `seo cache clear --provider google-analytics` to remove cached Google
Analytics responses immediately. Run `seo cache clear --provider gsc` to do
the same for Search Console. Run `seo cache clear --provider clicky` to remove
cached Clicky responses. Settings and saved provider credentials remain until
you delete them with the relevant command or run `seo reset --yes`. The reset
command removes Google tokens, local configuration, caches, logs, any
histories or reports saved by earlier versions, and saved provider
credentials. It removes active keychain credentials before deleting local
files. If the keychain refuses a deletion, reset stops and tells you to unlock
it before trying again.

## Optional research provider requests

Research-provider requests send only the inputs needed for the selected
operation. Depending on the provider and report, these can include:

- keywords, domains, URLs, result limits, country, and language.

DataForSEO requests use your login and API password. Ahrefs requests use your API v3 bearer key and can include the
target mode and country filter. Each provider also receives ordinary network
metadata.

`seo internal-links` sends page text to TypeSafe when a TypeSafe key is set
(`TYPESAFE_API_KEY` on your machine, or saved on your seoskill.dev account
and delivered by `seo login`). For each crawled page it sends the URL,
title, description, headings and opening sentences, and for each link it
judges, the source sentences that could hold the link and the target's
title, description and opening. The requests go from your machine with your
key, and TypeSafe processes them under the
[TypeSafe privacy policy](https://typesafe.ai/legal/privacy-policy). Without a key, nothing
is sent to TypeSafe.

The project maintainer does not receive these credentials, inputs, or
responses. DataForSEO processes them under its
[privacy policy](https://dataforseo.com/privacy-policy). As of the date of this
policy, DataForSEO says it stores API task data for 365 days. Its policy and
retention can change independently of this project. Ahrefs processes requests
under the [Ahrefs privacy policy](https://ahrefs.com/legal/privacy-policy).

Importing a local DataForSEO or Ahrefs file does not upload it to the
provider or the project maintainer.

## Other network requests

Other commands can make these direct requests:

- Crawls request the public pages, sitemaps, robots files, and agent files you
  select. External-link checks can request linked third-party pages. Browser
  rendering can also load scripts, images, fonts, and other resources embedded
  by a page.
- Chrome UX Report requests send the requested URL or origin, form factor,
  metrics, and your API key to Google.
- Search status checks request Google's public incident feed without sending a
  site or property.
- Package update checks can request current package information from the npm
  registry.
- Anonymous usage events can be sent to seoskill.dev as described in the next
  section.

The remote service receives ordinary network metadata in addition to the
listed inputs and handles it under its own terms and privacy policy.

When an agent or MCP client runs the software, that client may send tool
inputs, report output, or conversation context to its chosen model provider.
That transfer is controlled by the client and model service, not by the local
`seo` process. Check the privacy settings and policy of the agent you use.

## How long research data is kept locally

`seo research` does not cache DataForSEO or Ahrefs responses. Older versions
did, and cache maintenance removes those entries once they are 30 days old.
On a machine where the command is no longer run, they can remain until you
clear the cache or reset the software. Older versions also kept a local
provider spend ledger. The software deletes it the next time it opens its
cache.

Run `seo cache clear --provider dataforseo` or
`seo cache clear --provider ahrefs` to remove one provider's cached responses.
Run the matching `seo providers <provider> disconnect` command to remove its
saved credential. These commands do not delete data already processed by an
external provider. Run `seo reset --yes` to remove every saved provider
credential along with local configuration, caches, histories, logs, and saved
reports.

## Anonymous tool usage

Anonymous usage telemetry is enabled by default with a one-time first-run
notice. It describes use of the tool, not the site or Google data being
analysed. Events can contain only a fixed event name, public report identifier
or top-level command name, package version, detected agent category, operating
system, architecture, Node major version, first-run ISO week, wire schema
version, and fixed failure classification for failed runs. The classification
can include a category, reason, and one allowlisted code context. It never
contains the underlying error text or a user-supplied value.

Telemetry never contains a user ID, machine ID, UUID, fingerprint, audited
domain, URL, hostname, page content, report content, Search Console or Google
Analytics response, Google property ID, token, secret, file path, username,
local hostname, raw error message, command argument, IP address, or location.
The complete event and field catalogue is published at
[seoskill.dev/telemetry](https://seoskill.dev/telemetry).

Once-only event state stays in a private local file in the existing SEO config
directory. The telemetry endpoint accepts only the published fixed schema and
writes those fields to a dedicated Cloudflare D1 table. The server adds only
the UTC receipt month, such as `2026-07`, so it can publish monthly totals
without storing an exact request time. The table has no account or identity
column. It does not use KV, R2, or Analytics Engine. Worker request logging is
disabled. The ingest code does not read request IP or Cloudflare location
fields, and neither is written to D1. Cloudflare still handles the ordinary
network request at its edge.

Disable all telemetry network calls with `seo telemetry disable`,
`DO_NOT_TRACK=1`, `SEOSKILL_TELEMETRY_DISABLED=1`, or
`SEO_TELEMETRY_DISABLED=1`. It is automatically disabled in common CI
environments. Use `seo telemetry status` to inspect the effective setting and
`seo telemetry enable` to turn the local setting back on. Environment and CI
overrides always win.

An unexpected CLI error can print a prefilled GitHub issue link. The link
contains only the package version, Node major, operating system, architecture,
fixed report or command name, and fixed failure classification. It does not
contain the raw error or command arguments. Nothing is sent to GitHub unless
you open the link, and you can review the form before submitting it.

Aggregate event counts are public at
[seoskill.dev/stats](https://seoskill.dev/stats). Failure counts, setup
completions and retention are not shown there; the maintainer reads them
privately to find and fix problems, including a weekly Telegram message with
failure totals, first audit rates and retention by version. The
public counts are described as installs, active machines, and audits, never
users. One person can have several installs, and clearing local state creates
a new install.

Once a day the CLI and local MCP server ask the npm registry for the latest
version number of `seo`, so they can say when an update is out. The request
sends nothing about you or your sites. Set `NO_UPDATE_NOTIFIER=1` to turn it
off.

Installing the package through npm or using GitHub is covered by the policies
of those services.

The seoskill.dev website uses [Clicky](https://clicky.com/terms/privacy) to
count visits and see which pages people use. Tracking cookies are disabled in
the website code. Clicky receives normal browser and request information such
as the page, referrer, device, and IP address.

On your first visit, the website sets one first-party cookie, `seo_first`,
for 30 days. It holds the host name of the site that sent you (never the full
address), the first page you opened without its query string, and any
`utm_source`, `utm_medium` and `utm_campaign` tags in that link. Later visits
never change it, and it is not set when your browser sends Global Privacy
Control. It is not sent to anyone else. The hosted MCP server reads it only
when you first sign up, as described above.

The website host and security provider may also process normal web request
data such as an IP address, user agent, requested path, and timestamp. Website
analytics and logs do not include the reports, tokens, or Google API responses
stored by the local software.

## Website tool requests

Most browser tool input stays in the browser. The log file analyzer, word
combiner, and pasted or uploaded validator modes do not upload their input to
seoskill.dev. A tool that fetches a public URL must send that URL to the
seoskill.dev Cloudflare Worker because normal browser cross-origin rules often
prevent a direct request. This includes live llms.txt, sitemap, robots.txt, and
favicon checks. The target server receives an ordinary request from
Cloudflare and can record it in its own logs.

Three provider-backed website tools send a target and the inputs needed for
the selected check from the Worker to an outside provider:

- Spam Score sends the domain or page to DataForSEO.
- Website traffic estimates send the domain, country, and language to
  DataForSEO.
- Domain Rating sends the domain to Ahrefs.

The provider credentials remain in encrypted Cloudflare Worker secrets. The
Worker returns a small normalized result and does not save submitted targets
or provider responses in a product database or public recent-search list.
DataForSEO and Ahrefs process these requests under the provider privacy
policies linked in the research-provider section above.

Provider-backed forms use Cloudflare Turnstile to limit automated use. The
browser sends challenge information to Cloudflare and the Worker validates the
single-use token before calling a provider. Every tool that reaches the Worker
also creates a daily HMAC from the Cloudflare-provided connecting IP address.
Only the HMAC, tool, date, and counters are stored in a Durable Object. The raw
IP is not stored in the counter, the HMAC changes each UTC day, and the object
deletes its stored data after 48 hours. People on one shared network can share
the same daily allowance.

## Sharing and sale

The project maintainer does not receive or sell the reports, connected account
data, or provider request data processed by the local software. A service you
choose receives only the request inputs needed for the operation you start, as
described above.

No local report is shared with another person or service unless you export,
copy, publish, transmit, or pass it to an agent or application yourself.

## Removing access and local data

Use `seo auth logout` to remove local Google tokens. Use
`seo providers dataforseo disconnect`, `seo providers ahrefs disconnect` or
`seo providers bing disconnect` to remove the corresponding saved credential.
To remove what the hosted MCP keeps, use **Delete everything** on the
[account page](https://seoskill.dev/account). Environment variables are
controlled by your shell or runtime and are not changed by these commands. Use `seo privacy` to
inspect local paths and `seo reset --yes` to remove every saved credential and
local file managed by the software.

You can also revoke the app from your
[Google Account connections](https://myaccount.google.com/connections).
Deleting local files does not delete data already held by Google, a research
provider, npm, GitHub, a site you crawled, an agent or model
provider, or your operating system backups.

## Changes to this policy

This policy will change when a collection, storage, retention, network, or
hosted-service boundary changes materially. The date at the top will be updated
when that happens. Earlier versions remain available in the public Git history.

## Privacy questions

Open an issue in the [public GitHub repository](https://github.com/iannuttall/seo/issues).
Do not include OAuth tokens, private reports, personal data, or other secrets in
a public issue.
