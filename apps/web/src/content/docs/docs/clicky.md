---
title: Connect Clicky analytics
description: Find your Clicky Site ID and sitekey, save them locally, and add observed page traffic to SEO reports.
---

Connect Clicky when you want page views and landing-page visits without setting
up Google Analytics. You need the Site ID and sitekey for each Clicky site you
want to use.

## Find the Site ID and sitekey

Sign in to Clicky, open the site, then open **Preferences**. Both values appear
on that page. Its URL looks like this:

```txt
https://clicky.com/stats/prefs?site_id=123456789
```

Copy the numeric **Site ID** and the **sitekey**. Do not copy the admin sitekey.
The normal sitekey provides read access to the stats API. Each Clicky site has
its own Site ID and sitekey, so use the pair shown for the domain you are
connecting.

Clicky's <a href="https://clicky.com/help/faq/common/site-id" target="_blank" rel="noreferrer">credential help</a>
and <a href="https://clicky.com/help/api" target="_blank" rel="noreferrer">stats API documentation</a>
also point to the site preferences page.

## Connect Clicky during setup

Start guided setup and choose **Clicky** when it asks which analytics service to
use:

```sh
seo start
```

If you already have project profiles, setup first asks whether to create a new
project or update one you select. A matching Search Console property does not
silently choose an existing project or become the property for a new one.

Enter the Site ID, then paste the sitekey into the masked prompt. Setup checks
the credentials with Clicky before saving the project profile. The profile
stores the Site ID. The sitekey is stored separately in the system keychain,
with a private local file fallback.

Saved credentials are keyed by Clicky Site ID. Connecting a second domain does
not replace the first domain's sitekey.

## Connect an existing project

Connect and verify the sitekey while selecting the existing project:

```sh
seo analytics clicky connect --project example --site-id 123456789
```

The command verifies the credentials before attaching that Clicky site. It
preserves the project's Search Console property, crawl URL, watched URLs, brand
terms, and other provider settings.

Scripts can also update the project profile separately:

```sh
seo projects add \
  --id example \
  --name "Example" \
  --site sc-domain:example.com \
  --url https://example.com \
  --clicky-site-id 123456789
```

Check the saved credential and make a live read request:

```sh
seo analytics clicky status --project example --check
```

## Read a Clicky report

Run a landing-page report for a complete date range:

```sh
seo analytics clicky report \
  --project example \
  --start-date 2026-07-01 \
  --end-date 2026-07-28
```

Use `--type pages` when you want total page views instead of visits that began
on each page. Add `--json` for scripts or agents. The command accepts at most 31
days per request and retains no more than 5,000 rows.

Clicky page views and landing-page visits can help prioritise crawled pages.
They do not become Google Analytics users, conversions, attribution or visitor
geography. Reports that need those fields still require Google Analytics.

## Use Clicky in CI

Set the sitekey for the site being queried, then pass its Site ID or saved
project:

```sh
SEO_CLICKY_SITEKEY=example-sitekey \
  seo analytics clicky report \
  --site-id 123456789 \
  --start-date 2026-07-01 \
  --end-date 2026-07-28 \
  --json
```

`SEO_CLICKY_SITEKEY` applies to that process. Local interactive use supports
several saved Clicky sites at once.

Remove one saved sitekey without affecting the others:

```sh
seo analytics clicky disconnect --project example
```

To remove Clicky from one project while keeping the sitekey for another
project, run:

```sh
seo analytics clicky detach --project example
```
