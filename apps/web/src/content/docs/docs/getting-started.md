---
title: Set up SEO Skills CLI and run your first report
description: Install SEO Skills CLI, connect Search Console, save a local project profile, and run a first report that points you to a clear next action.
---

You need Node 22 or newer and a Google account that can read the site's Search
Console property. GA4 is optional.

## Start without installing anything globally

Run the guided setup through `npx`:

```sh
npx seo start
```

Setup opens Google sign-in in your browser. After you approve read-only access,
the CLI brings you back to the terminal and asks you to choose:

1. A Search Console property.
2. An optional GA4 property.
3. A name for the project profile saved on your computer.

A project profile is a local shortcut. It remembers the property, crawl URL,
optional GA4 property, and brand terms you would otherwise repeat on every
command. If this is your only site, make it the default and most commands will
need no flags.

The [Google connection guide](/docs/google) explains the permissions and data
limits before you sign in.

## Install the command once for regular use

The global package gives you the shorter `seo` command:

```sh
npm i -g seo
seo start
```

Do not run the global install with `sudo`. If npm reports a permission error,
fix npm's global install directory or keep using `npx seo`.

## Add the skills when an agent will use it

The CLI and MCP server run the reports. The skills teach an agent which report
fits the job, how to interpret its limits, and what to verify next. Install
both for the strongest agent setup:

```sh
npm i -g seo
npx skills add iannuttall/seo
```

You only need the first command for direct terminal use, scripts, and CI. An
agent can call the CLI without the skills, but it loses the report-specific SEO
guidance that keeps the analysis focused and honest.

## Run the main report first

```sh
seo report
```

`seo report` uses the default project profile. It checks the available search,
analytics, and technical evidence, then recommends focused reports that can
answer the next question. Start there unless you already know the exact job.

Read the result in this order:

1. Check the date range and data status.
2. Read skipped sections and caveats before treating an absence as zero.
3. Pick one or two actions with specific page or query evidence.
4. Run the recommended focused command to confirm the affected set.
5. Save the crawl or baseline you will need to verify the change later.

For example, a low-CTR finding is a prompt to inspect the query, page, search
appearance, and current snippet. It is not proof that rewriting a title will
increase clicks. The [reports and data guide](/docs/reports) covers those
boundaries in more detail.

## Choose a different saved site

List your project profiles and pass the one you want:

```sh
seo projects list
seo report --project example
seo crawl --project example --max-pages 500
```

`--project` accepts the saved id or name. The CLI can also work without a
profile when a command has enough explicit input:

```sh
seo report --site sc-domain:example.com
seo crawl https://example.com
seo audit-page --url https://example.com/pricing
```

That one-off path is handy for a public page check. A profile is calmer for
ongoing work because you are less likely to query the wrong property.

## Keep going when one source is missing

A useful report should survive a missing optional section. If GA4 is not
connected or a Search Console window is too sparse, the report records the
skip reason and continues with evidence that still holds.

Errors that invalidate the whole run still stop clearly. An expired login,
unknown property, or corrupt provider response should never produce a cheerful
empty report.

## Check the local setup

```sh
seo doctor
seo auth status
seo projects list
seo privacy
```

`seo doctor` checks authentication and local configuration. `seo privacy`
prints the paths used for profiles, tokens, caches, and saved reports on your
operating system.

Use `seo auth logout` to delete local Google tokens. Use `seo reset` only when
you want to remove all local SEO Skills CLI data. The [privacy policy](/privacy)
documents every storage and network boundary.

## Add your agent after the first report works

Once `seo report` runs in the terminal, connect the [local MCP server](/docs/mcp)
and install the [focused SEO skills](/docs/skills). The MCP server gives the
agent the tools; the skills teach it how to use them. Testing the human path
first makes auth and property mistakes much easier to spot.
