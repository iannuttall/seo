# Site agent notes

This package is the Astro site for `https://seoskill.dev`. Pages stay static.
A small Hono app on Cloudflare Workers handles bounded API work and serves the
built assets.

Before writing, editing, or generating any site copy, read the root
`CONTENT.md` file in the same task. This includes metadata and shared template
copy.

## Commands

Run these from the repository root:

```sh
pnpm --filter @seo/web dev
pnpm build:web
pnpm --filter @seo/web typecheck
pnpm --filter @seo/web test
pnpm deploy:web:dry-run
```

## Site rules

- Keep page content static. The Hono Worker is limited to `/api/t`,
  `/api/stats`, bounded `/api/tools/*` jobs, and the static assets binding.
  Tool APIs must validate public upstream URLs, bound network and output work,
  and return partial or capped states rather than hiding them. The Astro
  integration writes Markdown alternatives during the build. Cloudflare zone
  Transform Rules handle `Accept: text/markdown` requests. Do not add an
  account system, cookies, analytics, or another hosted product surface
  without an explicit product decision. The hosted MCP at
  `seoskill.dev/mcp` is a separate Worker in `apps/mcp`; it owns `/mcp`,
  `/mcp/*`, `/oauth/*`, `/account`, `/account/*` and
  `/.well-known/oauth-*`, so the site must never publish pages on those
  paths. The `/account` page and its session cookie belong to that Worker.
- Keep canonical metadata, structured data, navigation, and footer markup in
  `src/layouts/BaseLayout.astro`, with the shared `Header.astro` and
  `Footer.astro`. The home page, docs, tools, stats, policy pages, and the
  404 page all use that layout.
- Docs are an Astro content collection of MDX files in `src/content/docs/`.
  The reading order, docs index groups, breadcrumbs, previous and next
  links, sitemap, and llms.txt all come from `src/content/docs-nav.mjs`. Each
  of the eight commands has one page under `/docs/commands/`. The `seo index`
  page lives at `/docs/commands/indexing` because Cloudflare folds any
  `/index` path into its parent. Shared MDX components live in
  `src/components/docs/`.
- The design system is copied from Ian's ilo web app. Tokens and shared
  typography live in `src/styles/globals.css`: Inter for text, JetBrains
  Mono for code, neutral oklch surfaces, one cyan primary, automatic light
  and dark mode, and one `--frame-max` (48rem) page frame applied with the
  `site-frame` class. Surfaces are soft `bg-muted` panels with rounded
  corners, not borders or shadows. Do not bring back the old brutalist
  look (Martian fonts, orange accent, hard borders, dotted shadows).
- Reuse the site components before writing page-specific markup. Page
  headers use `PageHeader.astro`, section intros use `SectionHeading.astro`,
  icon cards use `HomeCard.astro` with Hugeicons through `HugeIcon.astro`,
  framed tool surfaces use `Card.astro`, buttons use `Button.astro` or
  `getButtonClasses` from `components/ui/button.ts`, accordions use
  `FaqAccordion.astro`, copyable examples use `CodeBlock.astro`, and the
  one-click MCP and CLI commands use `SetupCommands.astro`. Extend a shared
  component when the same visual pattern needs richer content. Do not
  recreate these patterns with one-page border, spacing, or interaction
  code.
- Documentation tables and code blocks use the shared `docs-prose` styling.
  Markdown code blocks get their copy button from
  `scripts/rehype-code-frame.mjs`. Do not invent separate table, heading,
  metric-card, or code-block treatments for a new page.
- Report ids live in `src/content/telemetry/report-ids.mjs`. The Worker
  accepts every id in that list for anonymous telemetry, because installed
  older clients keep sending them, so never remove an id. The same file maps
  each id to the command page that covers it, and
  `scripts/build-redirects.mjs` turns that map into permanent redirects in
  `public/_redirects`.
- Keep canonical URLs slashless through `src/lib/urls.ts`, Astro config, and
  Wrangler asset handling.
- Generate exact sitemap XML into `public/` with
  `scripts/build-sitemap.mjs`. `/sitemap.xml` is the only sitemap.
- Render privacy and terms copy from the canonical repository Markdown
  files. Do not duplicate those policies in site pages. The site has no
  security or trademark page: `/security` redirects to the GitHub security
  policy and `/trademarks` to the home page.
- Questions and ordinary support go to GitHub Issues. Vulnerabilities go to
  GitHub private vulnerability reporting. Do not add an email address.
- Teach the published package path first: `npm i -g seo`, then `seo start`.
  Keep source-build instructions lower down.
- Teach the hosted MCP next to the CLI: `claude mcp add --transport http
  seoskill https://seoskill.dev/mcp`, `codex mcp add seoskill --url
  https://seoskill.dev/mcp`, or the URL as a remote MCP server. Keep hosted
  facts in step with `apps/mcp/README.md`: Google sign-in, no password, and
  only linked Google accounts and saved keys kept, encrypted. Search data,
  reports and request logs are never stored. Bing runs only in the CLI and
  the local MCP server for now. Keys can be saved on `/account` or sent as
  headers. Wherever Domain Rating appears, credit it as Domain Rating by
  Ahrefs with a link to ahrefs.com.
- Generate `/.well-known/agent-skills/` from the root `skills/` directory.
  Never hand-edit or commit the generated files.
- Use plain, human copy with sentence-case headings. Lead with the outcome,
  support claims with specific evidence, and keep contributor details out of
  the primary user journey. Follow the root `CONTENT.md` guide for titles,
  product vocabulary, instructions, report pages, and SEO copy.
- Do not expose report-contract or implementation language in public copy.
  Field names, implementation limits and registry terminology belong in agent
  or developer output. A command page only adds a short limitation when it
  changes how that specific result should be used.
- Keep client-side JavaScript limited to real interactions: setup tabs,
  copy buttons, accordions, the stats loader, and the free tools.
- After a visual change, inspect the rendered desktop and mobile pages. Passing
  an Astro build is not a substitute for checking layout, wrapping, spacing,
  component reuse, and dark mode.
- Do not commit `.astro/`, `.wrangler/`, `dist/`, or `node_modules/`.
- Use `pnpm`, not npm, for repository development.

## Pre-ship checks

After site changes, run:

```sh
pnpm build:web
pnpm --filter @seo/web typecheck
pnpm --filter @seo/web test
pnpm deploy:web:dry-run
```

Spot-check the home page, docs, mobile layout, privacy, terms, canonical tags,
Open Graph tags, JSON-LD, `robots.txt`, `sitemap.xml`, and the custom 404 page.
