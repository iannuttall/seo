# Privacy policy

Last updated: 23 July 2026

This policy covers the official `seo` command-line tool, library, MCP server,
and the seoskill.dev website.

The current software runs on your machine. It does not create an SEO account,
upload reports to a hosted SEO service, or send reports or connected account
data to the project maintainer.

Local first describes where the software runs and stores its data. It does not
mean every command works offline. A command can make a direct request from your
machine to Google, a research provider, a site, or another service needed for
the work you requested. The sections below explain what each request can send.

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
join search or analytics evidence to crawl findings, and save local report
history when a command supports it. It does not use Google data for advertising
or to train general-purpose AI models.

The shared desktop OAuth client identifies the `seo` app to Google. OAuth
tokens and API responses are returned to your machine, not to the project
maintainer.

The use of information received from Google APIs follows the [Google API
Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including its Limited Use requirements.

## When Search Console query text can leave your machine

External enrichment is off by default. Three reports can send a limited part of
their retained Search Console evidence to the connected research provider when
you explicitly enable it:

- `keyword-opportunities` can send selected query text for keyword metrics when
  `includeExternal` is `true`;
- `local-search-demand` can send selected local-intent query text for live
  results when `includeSerps` is `true`; and
- `pseo-opportunities` can send research seeds derived from retained query and
  template evidence when `includeExternal` is `true`.

These requests do not send Google OAuth tokens, Google account identity,
Search Console property IDs, clicks, impressions, click-through rate,
positions, or Google Analytics rows. The selected query or seed text is
processed by the research provider under its own privacy policy. The report
shows that external evidence was requested and keeps its meaning separate from
first-party metrics.

## How Google data is protected

The software stores project profiles, settings, OAuth tokens, cached API
responses, logs, and saved reports in local user directories. It does not
upload Google API responses to a hosted SEO account or project database.
Google API requests go directly from your machine to Google over HTTPS. The
only external research-provider use of selected query or seed text is the
explicit enrichment described above.

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
the same for Search Console. Project profiles and reports that you deliberately
save remain until you delete them with the relevant command or run
`seo reset --yes`. The reset command removes Google tokens, local
configuration, caches, logs, histories, saved reports, and saved provider
credentials. It removes active keychain credentials before deleting local
files. If the keychain refuses a deletion, reset stops and tells you to unlock
it before trying again.

## Optional research provider requests

DataForSEO requests can send the exact inputs needed for the selected
operation. Depending on the report, these can include:

- keywords, research seeds, domains, URLs, filters, result limits, country,
  language, location, and device;
- target names and aliases used for indexed AI mention research; and
- the full fixed prompt, selected model, country, web search setting, and
  output limit used for an AI prompt observation.

Your DataForSEO login and API password authenticate these HTTPS requests. The
project maintainer does not receive the credentials, inputs, or responses.
DataForSEO processes them under its
[privacy policy](https://dataforseo.com/privacy-policy). As of the date of this
policy, DataForSEO says it stores API task data for 365 days. Its policy and
retention can change independently of this project.

The exported TypeScript library also includes a Semrush adapter. If you
configure and call it, Semrush receives the API key and the phrase, domain,
URL, database, columns, and limits needed for that request. The current CLI
uses Semrush and Ahrefs ranked-keyword exports as local files rather than live
connections. Importing a provider file does not upload it to the provider or
the project maintainer. The Semrush library adapter caches responses locally
for up to 14 days. Cache maintenance enforces a 16 MiB Semrush-cache limit and
removes rows older than 30 days. Run
`seo cache clear --provider semrush` to remove those cached responses.

## Bing Webmaster requests

Bing Webmaster is optional. If you connect it, the software sends your API key
or OAuth bearer token, verified site URL, and the parameters needed for the
report directly to Bing over HTTPS. Bing can return verified-site, traffic,
crawl, query, page, and link data. The current report does not cache Bing
responses. Microsoft processes the request under its
[privacy statement](https://privacy.microsoft.com/privacystatement).

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
- A live IndexNow submission sends the host, changed URLs, key, and public key
  location to IndexNow. A dry run does not submit them. IndexNow handles the
  request under its [terms](https://www.indexnow.org/terms).
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

DataForSEO responses are cached locally for up to 24 hours or seven days,
depending on the operation. Cache maintenance removes provider cache entries
older than 30 days and enforces a 32 MiB provider-cache limit. On a machine
where the command is no longer run, expired rows can remain until you clear the
cache or reset the software.

Fixed AI prompt observations are saved locally so repeated runs can show
compatible changes over time. History is bounded to 90 observations for one
exact configuration, 10,000 observations in total, and 128 MiB of logical
storage. The local provider spend ledger is retained for up to 730 days and is
bounded to 50,000 rows and 32 MiB.

Run `seo cache clear --provider dataforseo` to remove cached DataForSEO
responses. Run `seo providers dataforseo disconnect` to remove saved
credentials. These commands do not delete task data already processed by
DataForSEO. Run `seo reset --yes` to remove every saved provider credential
along with local configuration, caches, histories, spend records, logs, and
saved reports.

## Anonymous tool usage

Anonymous usage telemetry is enabled by default with a one-time first-run
notice. It describes use of the tool, not the site or Google data being
analysed. Events can contain only a fixed event name, public report identifier,
package version, detected agent category, operating system, architecture, Node
major version, first-run ISO week, wire schema version, and a fixed error
category for failed reports.

Telemetry never contains a user ID, machine ID, UUID, fingerprint, audited
domain, URL, hostname, page content, report content, Search Console or Google
Analytics response, Google property ID, token, secret, file path, username,
local hostname, raw error message, IP address, or location. The complete event
and field catalogue is published at
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

Aggregate event counts are public at
[seoskill.dev/stats](https://seoskill.dev/stats). They are described as
installs, active machines, and audits, never users. One person can have several
installs, and clearing local state creates a new install.

Installing the package through npm or using GitHub is covered by the policies
of those services.

The seoskill.dev website uses [Clicky](https://clicky.com/terms/privacy) to
count visits and see which pages people use. Tracking cookies are disabled in
the website code. Clicky receives normal browser and request information such
as the page, referrer, device, and IP address.

The website host and security provider may also process normal web request
data such as an IP address, user agent, requested path, and timestamp. Website
analytics and logs do not include the reports, tokens, or Google API responses
stored by the local software.

## Sharing and sale

The project maintainer does not receive or sell the reports, connected account
data, or provider request data processed by the local software. A service you
choose receives only the request inputs needed for the operation you start, as
described above.

No local report is shared with another person or service unless you export,
copy, publish, transmit, or pass it to an agent or application yourself.

## Removing access and local data

Use `seo auth logout` to remove local Google tokens,
`seo providers dataforseo disconnect` to remove saved DataForSEO credentials,
`seo providers bing disconnect` to remove the saved Bing credential, and
`seo indexnow remove --site https://example.com` to remove a saved IndexNow key
for one site. Environment variables are controlled by your shell or runtime and
are not changed by these commands. Use `seo privacy` to inspect local paths and
`seo reset --yes` to remove every saved credential and local file managed by
the software.

You can also revoke the app from your
[Google Account connections](https://myaccount.google.com/connections).
Deleting local files does not delete data already held by Google, a research
provider, Bing, IndexNow, npm, GitHub, a site you crawled, an agent or model
provider, or your operating system backups.

## Changes to this policy

This policy will change when a collection, storage, retention, network, or
hosted-service boundary changes materially. The date at the top will be updated
when that happens. Earlier versions remain available in the public Git history.

## Privacy questions

Open an issue in the [public GitHub repository](https://github.com/iannuttall/seo/issues).
Do not include OAuth tokens, private reports, personal data, or other secrets in
a public issue.
