---
name: setup-check
description: Check whether local SEO Skills CLI authentication and defaults are usable; use it before reports when login, scopes, or saved configuration may be incomplete.
---

# Check local setup

Run `setup-check` before blaming a report for an authentication or configuration
failure. It reads local setup state and separates missing credentials, missing
Google scopes, and absent defaults from actual SEO evidence. A passing result
means the local prerequisites look present. It does not prove that a token is
still accepted by Google or that the account can access a particular property.

## Run the report

With MCP, call `seo_list_reports` with `{"category":"setup"}`. Then call
`seo_describe_report` with `{"id":"setup-check"}` and use the returned schema.
Finally call `seo_run_report` with `{"id":"setup-check","params":{}}`. The report
accepts no parameters, so do not invent a site, project, or refresh field.

The CLI exposes the same registry and schema:

```sh
seo reports describe setup-check --json
seo reports run setup-check --params '{}' --json
```

Read MCP `structuredContent` or the CLI JSON as the machine contract. Use the
text response only as a short presentation layer.

## Interpret the checks

Start with `ok`, then inspect every entry in `checks`. `status` distinguishes a
blocking `fail` from a non-blocking `warn`; `detail` records what was observed;
`fix` gives the matching local remedy when one exists. `generatedAt` tells you
when the filesystem and token metadata were checked. Missing saved GSC or GA4
defaults are normally warnings because explicit report parameters can replace
them.

Never copy account emails, token contents, OAuth client values, private keys,
or local credential files into an answer. Summarise the check id, status, and a
safe fix instead.

## Act safely

Apply the narrow fix attached to a failed check, such as logging in again or
restoring the same OAuth client used by stored tokens. Re-run `setup-check`, then run
a small read-only report for the intended property. Do not treat a setup pass
as evidence about rankings, indexing, analytics accuracy, or site health.
