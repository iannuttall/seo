# Agent skills

These skills teach an agent how to use `seo` without reading the whole repo.

They work best with the MCP server installed. This command is an interactive
setup flow for a human:

```bash
seo mcp install
```

They can also call the CLI directly when MCP tools are not available. The npm
package and repository contain the same skill folders. Install the collection
with the standard agent skills installer:

```bash
npx skills add iannuttall/seo --all
```

Use `seo skills list` or `seo skills path <name>` to inspect the copies bundled
with the npm package.

The MCP path is deliberately small: discover ids with `seo_list_reports`, load
one schema with `seo_describe_report`, then execute it with `seo_run_report`.
The skills name the report ids for their workflow.

The same catalog is available without MCP:

```bash
seo reports list --json
seo reports describe <report-id> --json
seo reports run <report-id> --params '<json>' --json
```

## Adding a report skill

Register a structured report once in `packages/mcp/src/report-registry.ts`.
CLI and MCP discovery will then share its id, description, input schema, and
handler. Add the same-name skill only after that contract exists.

Every report skill must:

- explain the technical SEO question and why it is useful;
- show `seo_list_reports`, `seo_describe_report`, and `seo_run_report` usage;
- show schema discovery and one valid `seo reports run` CLI example;
- explain the evidence fields, partial-data states, and important caveats;
- turn findings into bounded actions and verification steps; and
- avoid turning estimates, conventions, or samples into search-engine rules.

Run `pnpm skills:validate` after adding or changing a skill. The validator
checks registry parity, command and tool names, frontmatter, package metadata,
and minimum report guidance depth.

## Curated workflow skills

- `seo-site-audit`: start with the main report, then add bounded technical evidence.
- `seo-geo-readiness`: check AI-search readiness and citation gaps.
- `seo-fix-queue`: turn crawl results into an implementation queue.
- `pseo-audit`: audit repeated URL templates with GSC, crawl, and URL Inspection evidence.
- `index-watch`: monitor exact indexed-state evidence, transitions, failures, and quota-deferred checks.
- `performance`: separate Lighthouse lab diagnostics, CrUX field Core Web Vitals, and unscored fallback evidence.
- `community-intent`: review explicit intent language in retained GSC queries without claiming a page gap.
- `seo-to-ai-query`: create deterministic monitoring-prompt suggestions from retained GSC queries.
- `measure-change`: compare equal finalized GSC windows without turning an incomplete after-period into a directional verdict.

The `seo` skill routes requests that span several focused workflows.

## Report skills

Every compact MCP report id has a same-name skill. Each skill teaches the
discovery flow and the evidence limits that matter for that report.

- Setup: `setup-check`.
- Diagnosis: `search-performance-overview`, `segment-impact`, `striking-distance`, `traffic-anomaly`, `update-correlation`.
- Opportunities: `cannibalisation`, `ctr-underperformers`, `decaying-pages`, `internal-links`, `query-clusters`, `quick-wins`.
- AI search: `ai-referrals`, `community-intent`, `content-optimization`, `page-opportunities`, `performance-audit`, `seo-to-ai-query`.
- Crawl: `affected-urls`, `ai-readiness`, `audit-urls`, `compare-crawls`, `site-crawl`, `entity-readiness`, `explain-crawl-issue`, `geo-gaps`, `crawl-report`, `crawl-history`, `crawler-rules`, `llms-txt-audit`, `generate-llms-txt`, `okf-build`, `okf-validate`, `top-fixes`.
- Monitoring: `crawl-diff`, `index-coverage`, `index-coverage-plan`, `index-monitor`, `index-watch`, `link-recovery`, `redirect-trace`.
- Reporting: `audit-page`, `monthly-report`, `pseo-audit`, `narrative-report`, `second-page`.
- Experiments: `measure-change`.
- Workflows: `monthly-action-plan`, `refresh-priorities`, `technical-watch`, `update-postmortem`.
