# Privacy policy

Last updated: 3 November 2026

This policy covers SEO Skill: the `seo` command-line tool and library, the
local and hosted MCP servers, your account at seoskill.dev, the paid weekly
site audit, and the seoskill.dev website and its free tools.

## In short

- The command-line tool runs on your machine. Your tokens, settings and
  cache stay there. We only receive anonymous usage counts.
- The hosted server keeps your sign-ins and keys, encrypted, so it can fetch
  your own data when you ask. It does not keep your Search Console or
  analytics data, your reports or a log of your requests.
- The paid weekly site audit is the exception. For the sites you add, it
  keeps what the audit needs, listed below, until you remove the site.
- We do not sell data or use it for advertising.
- **Delete everything** on the [account page](https://seoskill.dev/account)
  removes everything the hosted server keeps about you.

## What the hosted server keeps

Everything is stored in Cloudflare D1. Tokens, keys and passwords are
encrypted before they are written.

- **Your account.** A random id, made when you first sign in with Google.
  There is no password.
- **Google accounts you link.** Each one's email address and tokens, with
  read-only access to Search Console and Google Analytics.
- **Bing, if you link it.** Its tokens, with read-only access to Bing
  Webmaster Tools, and a name made from its sites.
- **Keys you save.** DataForSEO, Ahrefs and TypeSafe keys.
- **Clicky, if you save it.** Each site's ID, sitekey and domain. If you save
  your Clicky login, we keep your username and password, encrypted, and use
  them only to read your list of Clicky sites. The password never leaves
  the server.
- **Simple Analytics, if you save it.** Your API key, encrypted.
- **Machines you link with `seo login`.** A name made from the machine's
  host name, and when it was last used.
- **How you signed up.** Written once: whether you came from an AI agent,
  the account page or `seo login`, the agent or browser name, and, if you
  visited the website first, the site that sent you, your first page and any
  `utm_` tags. No IP address or email. We look at it only as totals, in a
  weekly message to the maintainer and on the public
  [stats page](https://seoskill.dev/stats), where any value shared by fewer
  than three sign-ups shows as Other.
- **Usage totals.** One number a day for each kind of paid-for work we do
  for you, such as browser time, Google index checks and research calls. No
  URLs or results.
- **Beta features** the maintainer turned on for your account.

We keep nothing else. Your Search Console, Google Analytics, Clicky, Simple Analytics and
provider data is fetched for each request, returned to your agent and not
kept. Request logs are turned off.

Keys sent as request headers instead of saved are used for that request
only.

The account page sets one essential cookie, `seo_session`, which holds your
encrypted account id for up to 30 days.

## The weekly site audit

If you pay, Stripe takes the payment and keeps your card. We keep only your
Stripe ids, your plan's status and how many sites you pay for.

For each site you add, we crawl it once a week as `SEOSkillBot`, up to 5,000
pages, following its `robots.txt`. Some pages are loaded in Cloudflare's
browser so we can read what JavaScript builds. For each site we keep:

- the last two crawls: each page's URL, status, title, description, first
  heading, canonical, robots settings, word count and internal links;
- the problems found in them, with when each was found and fixed (fixed
  ones are removed after 90 days), and a one-line count for each of the last
  52 crawls;
- Google's index status for each known page, checked in the background
  each day, with when it dropped out of or came back to the index;
- each page's Search Console clicks and impressions for the last 28 days,
  replaced daily;
- the issues list, if you ask for it, with what you marked each issue;
- which parts of the site need a browser to read, for 28 days.

**Alerts.** Your alert settings, webhook address and signing secret, and the
alerts sent in the last 30 days. Alert and weekly emails go to your first
Google account's address through our email provider, PostShiba.

**Competitor check.** Each paid site gets a weekly check for keywords its
competitors rank for and it does not. It runs on our own provider accounts,
not your keys. We keep the site's competitors, up to 500 of each
competitor's keywords (removed 90 days after they were last fetched), the
keywords ruled out in the last 28 days, and the keywords we suggested. To
run it we send:

- DataForSEO: the site's and its competitors' domains, its main country and
  the candidate keywords;
- TypeSafe: the site's domain, its top 25 Search Console queries and the
  candidate keywords with the competitor pages that rank for them, so its
  Jev model can judge whether each keyword fits the site;
- Ahrefs: the domains in the top 10 results, for their Domain Rating.

**AI answer check.** Each paid site also gets a weekly check of whether
ChatGPT search, Google AI Mode and AI Overviews cite it. It runs on our own
DataForSEO account, not your key. We send DataForSEO the site's domain, its
main country and up to 10 questions from its Search Console queries. We keep
those questions and, for each one and each engine, whether this week's and
last week's answer cited or named the site, which page it cited and the
other sites the answer cited.

**Search Console folders.** If you click Create these in Search Console,
Google asks for permission to add properties. We use it once, to add the
listed folders, and do not keep it.

Remove a site and all of its data is deleted at once.

## The free tools on the website

Most tools run in your browser and send nothing to us: the log file
analyzer, word combiner, pasted or uploaded validators, and the tools that
read a Search Console export.

- **Signed-in tools.** The Google algorithm update checker can read your
  daily clicks through your SEO Skill account. The clicks are fetched for
  that request and not kept. Remove the Google account on the account page
  to stop it.
- **Internal linking tool.** When you sign in and run it, `SEOSkillBot`
  crawls a site from your Search Console (up to 100 pages, or 5,000 for a
  site in the weekly audit), following its `robots.txt`. Each page's URL,
  title, description, headings, opening text and the sentences that could
  hold a link go to TypeSafe on our key, so Jev can judge the links. Your
  Search Console queries are read to count shared searches and not kept.
  The crawl is deleted when the run ends. The result is kept for 24 hours,
  then deleted. We keep a daily count of runs and pages for the limits.
- **Tools that fetch a page.** Checks of a live page, sitemap, robots.txt,
  llms.txt, favicon, Open Graph or search preview send the URL to our
  Cloudflare Worker, which fetches it. The domain age checker asks the
  domain's registry.
- **Tools that use a provider.** Spam Score, website traffic, backlinks,
  competitor keywords and the SERP checker send your input to DataForSEO.
  Domain Rating and the Domain Rating column send domains to Ahrefs. We do
  not keep your input or the results.
- **Limits.** These forms use Cloudflare Turnstile to stop bots. To apply
  daily limits we keep a code made from your IP address that changes each
  day, with a count, and delete it after 48 hours. We never store the IP
  address itself.
- The update checker loads Google's public Search Status feed straight
  from your browser.

## The website

- **Analytics.** We use [Clicky](https://clicky.com/terms/privacy) to count
  visits, with its cookies turned off. Clicky receives normal request data
  such as the page, referrer, device and IP address. Visit totals are on the
  [stats page](https://seoskill.dev/stats).
- **First-visit cookie.** On your first visit we set one cookie,
  `seo_first`, for 30 days. It holds the site that sent you (the host name
  only), your first page and any `utm_` tags. It is never changed, never
  sent to anyone else, read only if you sign up, and not set if your browser
  sends Global Privacy Control.
- **Hosting.** Cloudflare hosts the website and the hosted server and sees
  normal request data.
- **Payments.** Stripe Checkout and the billing portal are on Stripe's own
  site, under Stripe's policies.

## The command-line tool

The `seo` command and the local MCP server run on your machine and do not
send your reports or data to us.

- **Stored on your machine.** Settings, Google tokens, provider keys, logs
  and a cache, in your user folders with private file permissions. Tokens
  and keys use your system keychain when it is available. Reports and crawls
  are not saved, except the issues list you ask for.
- **Cache.** Google and Clicky answers are reused for up to 24 hours, and
  Google index checks for up to 7 days. Old cache rows are removed after 30
  days.
- **Direct requests.** Commands talk straight to Google, Bing, Clicky, Simple Analytics, the
  research providers and the sites you crawl. Each receives only what that
  command needs, plus normal network data.
- **`seo login`.** A linked machine gets short-lived Google and Bing tokens
  and your saved keys from your account, and makes the requests itself.
  Nothing it fetches is sent back.
- **TypeSafe.** With a TypeSafe key, `seo internal-links` sends page titles,
  descriptions, headings, opening sentences and candidate sentences to
  TypeSafe so its Jev model can judge links.
- **Updates.** Once a day the tool asks npm for the latest version number.
  Set `NO_UPDATE_NOTIFIER=1` to stop it.

To remove things:

- `seo auth logout` removes your Google tokens.
- `seo providers <provider> disconnect` removes a saved key.
- `seo cache clear --provider <provider>` clears a provider's cache.
- `seo reset --yes` removes every token, key, setting, cache and log.
- `seo privacy` shows where everything is stored.

## Google data

Connecting Google is optional. We ask for read-only access to your email
address, Search Console and Google Analytics. We use that data only to run
the reports and checks you ask for. We do not use it for advertising or to
train general AI models, and we do not sell it.

Our use of data from Google APIs follows the [Google API Services User Data
Policy](https://developers.google.com/terms/api-services-user-data-policy),
including its Limited Use requirements.

You can remove our access at any time in your
[Google Account connections](https://myaccount.google.com/connections).

## Other services

When you use a provider, it handles your request under its own policy:
[DataForSEO](https://dataforseo.com/privacy-policy) (which says it keeps
API task data for 365 days), [Ahrefs](https://ahrefs.com/legal/privacy-policy),
[TypeSafe](https://typesafe.ai/legal/privacy-policy), Clicky, Simple Analytics, Bing and
Google.

Your AI agent sends tool results to its model provider. That is up to your
agent and its settings, not us.

## Anonymous usage counts

The tool and the hosted server send anonymous events, such as "a report
ran", so we can see what is used and fix what breaks. An event can hold
only:

- the event, report or command name;
- the version, agent type, operating system, chip type and Node version;
- the week the tool was first run;
- for a failure, a fixed reason code, never the error text.

It never holds a site, URL, query, key, account, file path, IP address or
any report data. We store only the month it arrived. Every field is listed
on the [telemetry page](https://seoskill.dev/telemetry), and totals are on
the [stats page](https://seoskill.dev/stats). Failure and retention counts
stay private and reach the maintainer in a weekly message.

Turn it off with `seo telemetry disable`, `DO_NOT_TRACK=1` or
`SEO_TELEMETRY_DISABLED=1`. It is off in CI.

## Delete your data

- **Hosted account.** **Delete everything** on the
  [account page](https://seoskill.dev/account) deletes your account, linked
  accounts, keys, Clicky sites, machines, audited sites and their data, alert
  history and how you signed up. It cancels a paid plan and revokes the
  Google sign-ins.
- **Your machine.** Run `seo reset --yes`.

Deleting with us does not delete data already held by Google, a provider,
your AI agent or your own backups.

## Changes

When this policy changes, the date at the top changes. Earlier versions are
in the public Git history.

## Questions

Open an issue on [GitHub](https://github.com/iannuttall/seo/issues). Do not
put tokens, keys or private data in a public issue.
