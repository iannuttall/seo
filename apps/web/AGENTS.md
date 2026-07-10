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
- Keep SEO metadata and structured data in `src/layouts/SiteLayout.astro`.
- Keep canonical URLs slashless through `src/lib/urls.ts`, Astro config, and
  Wrangler asset handling.
- Generate exact sitemap XML into `public/` with
  `scripts/build-sitemap.mjs`.
- Render privacy, terms, security, and trademark copy from the canonical
  repository Markdown files. Do not duplicate those policies in site pages.
- Questions and ordinary support go to GitHub Issues. Vulnerabilities go to
  GitHub private vulnerability reporting. Do not add an email address.
- Teach the published package path first: `npx seo start` or
  `npm install --global seo`. Keep source-build instructions lower down.
- Do not document a hosted service or remote MCP until it exists.
- Use plain, human copy with sentence-case headings. Avoid hype, gradients,
  decorative cards, and oversized empty hero sections.
- Keep the site free of client-side JavaScript unless a real interaction needs
  it.
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
