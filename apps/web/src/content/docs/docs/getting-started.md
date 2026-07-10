---
title: Getting started
description: Run the guided setup, choose a site, and get the first useful report without learning the whole command tree.
---

## Run without a global install

You need Node 22 or newer. Start the guided flow with:

```sh
npx seo start
```

Then run the main report:

```sh
npx seo report
```

## Install the command once

If you use it regularly, install the same package globally:

```sh
npm i -g seo
seo start
seo report
```

## What setup asks for

The prompts connect a Google account, let you choose a Search Console
property, optionally choose a GA4 property, and save a local project profile.
A project profile is a shortcut for the site and provider IDs you would
otherwise repeat on every command.

Official releases can include the shared desktop Google OAuth client. When it
is present, setup opens Google sign-in in your browser and redirects back to
the local CLI. Tokens return to and remain stored on your machine.

## Use more than one site

Choose a saved profile with `--project`:

```sh
seo report --project example
seo projects list
```

You can also run without a saved profile:

```sh
seo report --site sc-domain:example.com
seo crawl https://example.com
seo audit-page --url https://example.com/pricing
```

## If a data source is missing

The report keeps going when one section lacks enough data. It records the
skipped section, explains why it was skipped, and suggests a useful next
command. Authentication and property errors that affect the whole report
still fail clearly.

## Inspect or remove local data

```sh
seo privacy
seo doctor
seo auth logout
seo reset
```

Read the [privacy policy](/privacy) for the full storage and network request
boundaries.
