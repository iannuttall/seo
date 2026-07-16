# Site agent notes

This package is the Astro site for `https://seoskill.dev`. Pages stay static.
A small Cloudflare Worker handles the anonymous telemetry API and serves the
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

- Keep page content static. The application Worker is limited to `/api/t`,
  `/api/stats`, and the static assets binding. The Astro integration writes
  Markdown alternatives during the build. Cloudflare zone Transform Rules
  handle `Accept: text/markdown` requests. Do not add an account system,
  remote MCP server, cookies, or another hosted product surface without an
  explicit product decision.
- Keep canonical metadata, structured data, navigation, and footer markup in
  `src/layouts/BaseLayout.astro`. Marketing, docs, reports, policy pages, and
  the 404 page all use that layout.
- Docs are a custom Astro content collection in `src/content/docs/docs/`.
  Navigation lives in `src/content/docs-nav.ts`; shared MDX components live in
  `src/components/docs/`.
- Brand tokens and all shared typography live in `src/styles/globals.css`.
  Match the current site system: Martian Grotesk for prose, Martian Mono for
  code and headings, an orange accent, automatic light/dark mode, the shared
  `max-w-4xl` reading frame, hard borders, and dotted offset shadows.
- Reuse the site components before writing page-specific markup. Page headers
  use `PageHeader.astro`, framed surfaces use `DottedCard.astro`, navigation
  cards use `NavCard.astro`, accordions use `FaqAccordion.astro`, and copyable
  examples use `docs/CopyCode.astro` or `InlineCode.astro`. Extend a shared
  component when the same visual pattern needs richer content. Do not recreate
  these patterns with one-page border, spacing, or interaction code.
- Documentation tables use the shared `docs-prose` table styling inside a
  `table-frame`. Documentation and report sections use the established heading
  scale and vertical rhythm from `ReportGuide.astro`. Do not invent separate
  table, heading, metric-card, or code-block treatments for a new page.
- Keep canonical URLs slashless through `src/lib/urls.ts`, Astro config, and
  Wrangler asset handling.
- Generate exact sitemap XML into `public/` with
  `scripts/build-sitemap.mjs`. `/sitemap.xml` is the only sitemap.
- Render privacy, terms, security, and trademark copy from the canonical
  repository Markdown files. Do not duplicate those policies in site pages.
- Questions and ordinary support go to GitHub Issues. Vulnerabilities go to
  GitHub private vulnerability reporting. Do not add an email address.
- Teach the published package path first: `npm i -g seo`, then `seo start`.
  Keep source-build instructions lower down.
- Do not document a hosted service or remote MCP until it exists.
- Generate `/.well-known/agent-skills/` from the root `skills/` directory.
  Never hand-edit or commit the generated files.
- Use plain, human copy with sentence-case headings. Lead with the outcome,
  support claims with specific evidence, and keep contributor details out of
  the primary user journey. Follow the root `CONTENT.md` guide for titles,
  product vocabulary, instructions, report pages, and SEO copy.
- Keep client-side JavaScript limited to real interactions: install tabs,
  copy buttons, accordions, and the example report panel.
- The home page example panels (`src/components/FeatureShowcase.astro` and
  `src/components/FeatureDemo.astro`) must only show real commands from the
  shipped CLI catalog and stay labelled as example data.
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
