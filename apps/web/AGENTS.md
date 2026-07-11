# Site agent notes

This package is the static Astro site for `https://seoskills.dev`.

## Commands

Run these from the repository root:

```sh
pnpm --filter @seo/web dev
pnpm --filter @seo/web build
pnpm --filter @seo/web typecheck
pnpm --filter @seo/web test
pnpm --filter @seo/web deploy:dry-run
```

## Site rules

- Keep the site static. Do not add a Worker runtime, account system, database,
  remote MCP server, telemetry, or cookies without an explicit product decision.
- Keep canonical metadata, structured data, navigation, and footer markup in
  `src/layouts/BaseLayout.astro`. Marketing, docs, reports, policy pages, and
  the 404 page all use that layout.
- Docs are a custom Astro content collection in `src/content/docs/docs/`.
  Navigation lives in `src/content/docs-nav.ts`; shared MDX components live in
  `src/components/docs/`.
- Brand tokens and all shared typography live in `src/styles/globals.css`.
  Match the restrained Audits site system: Inter for prose, JetBrains Mono for
  code, neutral surfaces, a cyan accent, automatic light/dark mode, a 48rem
  reading frame, and consistent rounded controls and cards.
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
  the primary user journey.
- Keep client-side JavaScript limited to real interactions: install tabs,
  copy buttons, accordions, and the example report panel.
- The home page example panel (`src/components/HeroPanel.astro` and
  `src/islands/HeroChat.tsx`) must only show real commands from the shipped CLI
  catalog and stay labelled as example data.
- Do not commit `.astro/`, `.wrangler/`, `dist/`, or `node_modules/`.
- Use `pnpm`, not npm, for repository development.

## Pre-ship checks

After site changes, run:

```sh
pnpm --filter @seo/web build
pnpm --filter @seo/web typecheck
pnpm --filter @seo/web test
pnpm --filter @seo/web deploy:dry-run
```

Spot-check the home page, docs, mobile layout, privacy, terms, canonical tags,
Open Graph tags, JSON-LD, `robots.txt`, `sitemap.xml`, and the custom 404 page.
