# Privacy policy

Last updated: 14 July 2026

This policy covers the official `seo` command-line tool, library, MCP server,
and the seoskill.dev website.

The current software runs on your machine. It does not create an SEO account,
upload reports to an SEO service, or send your Google data to the project
maintainer.

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

## What stays on your machine

The software stores project profiles, settings, OAuth tokens, caches, logs, and
saved reports in local user directories. `seo privacy` prints the relevant
paths and file permissions.

OAuth tokens use the operating system keychain when that option is enabled.
The fallback token file and any bring-your-own OAuth client file are written
with user-only file permissions. You are responsible for the security of your
device, backups, shell history, exported reports, and any environment variables
you create.

## Network requests

Commands connect directly from your machine to the services needed for the
work you request. These can include Google APIs, public pages and sitemaps you
choose to crawl, and the npm registry for package update checks. Those services
receive ordinary request data under their own privacy policies.

The CLI does not include project-controlled usage telemetry. Installing the
package through npm or using GitHub is covered by the policies of those
services.

The seoskill.dev website uses [Clicky](https://clicky.com/terms/privacy) to
count visits and see which pages people use. Tracking cookies are disabled in
the website code. Clicky receives normal browser and request information such
as the page, referrer, device, and IP address.

The website host and security provider may also process normal web request
data such as an IP address, user agent, requested path, and timestamp. Website
analytics and logs do not include the reports, tokens, or Google API responses
stored by the local software.

## Sharing and sale

The project maintainer does not receive or sell the Google user data processed
by the local software. The software sends data to Google only as needed to make
the API request you initiated. It sends crawl requests to the public sites you
ask it to inspect.

No local report is shared with another person or service unless you export,
copy, publish, or transmit it yourself.

## Removing local data and Google access

`seo auth logout` removes locally stored Google tokens. `seo reset --yes`
removes local SEO configuration, tokens, caches, logs, and saved data managed by
the tool.

You can also revoke the app from your [Google Account connections](https://myaccount.google.com/connections).
Deleting local files does not delete data held by Google, npm, GitHub, a site
you crawled, or your operating system backups.

## Changes to this policy

This policy will change if the product starts collecting data or adds a hosted
service. The date at the top will be updated when that happens. Earlier versions
remain available in the public Git history.

## Privacy questions

Open an issue in the [public GitHub repository](https://github.com/iannuttall/seo/issues).
Do not include OAuth tokens, private reports, personal data, or other secrets in
a public issue.
