# Agent skills

This package ships one skill: `seo`. It teaches an agent how to use `seo`
without reading the whole repo.

The skill is a short map of the CLI and MCP tools, not a manual. It says
what each command returns, how to reach it, and that `seo crawl` needs no
sign-in. It sets no rules for how the agent works: each result states its own
limits and names the command to run next, so the skill stays small.

## Install during setup

Install the CLI and run the guided setup when you are starting from scratch:

```bash
npm i -g seo
seo start
```

Setup offers to install both the skill and local MCP server. If the CLI is
already set up, install or reinstall the skill directly:

```bash
seo skill install
```

The skill can call the CLI directly when MCP tools are not available. The npm
package and repository contain the same skill.

Use `seo skill list` or `seo skill path seo` to inspect the copy bundled with
the npm package.

## The commands

The MCP tools and CLI commands are the same set: `seo_report` and
`seo report`, `seo_page` and `seo page`, and so on. They are defined once in
`packages/core/src/commands/tools.ts`, so the hosted server, the local server
and the CLI cannot drift apart. The local server adds `seo_crawl` and
`seo_internal_links`.

## Adding a report

A new Search Console analysis becomes a section of `seo report`, not a new
command: add it to `SECTIONS` in `packages/core/src/commands/report.ts` with
its core report function. Every surface then shows it. No new skill file is
needed. Add a command only when Ian changes the product contract.

Run `pnpm skills:validate` after changing the skill or the registry. The
validator checks the skill frontmatter and word count, that every command and
report id the skill names resolves, that the MCP tool names are real, and that
every `evals/*.json` is well formed.

## Evals

Behaviour tests for the skill live in the top-level `evals/` directory. See
[../evals/README.md](../evals/README.md) for the file shape and how to run them.
