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
- Keep SEO metadata and structured data for marketing and policy pages in
  `src/layouts/SiteLayout.astro`. Docs pages are Starlight content in
  `src/content/docs/docs/`; their shared head tags and JSON-LD live in the
  Starlight `head` config in `astro.config.mjs`.
- Brand tokens live in `src/styles/global.css` (marketing pages) and
  `src/styles/starlight.css` (docs). Keep the two palettes in sync: white
  light mode with the purple accent, navy dark mode with the light blue
  accent, and square corners everywhere.
- Keep canonical URLs slashless through `src/lib/urls.ts`, Astro config, and
  Wrangler asset handling.
- Generate exact sitemap XML into `public/` with
  `scripts/build-sitemap.mjs`. The build removes Starlight's generated
  `sitemap-index.xml` so `/sitemap.xml` stays the only sitemap.
- Render privacy, terms, security, and trademark copy from the canonical
  repository Markdown files. Do not duplicate those policies in site pages.
- Questions and ordinary support go to GitHub Issues. Vulnerabilities go to
  GitHub private vulnerability reporting. Do not add an email address.
- Teach the published package path first: `npx seo start` or
  `npm i -g seo`. Keep source-build instructions lower down.
- Do not document a hosted service or remote MCP until it exists.
- Generate `/.well-known/agent-skills/` from the root `skills/` directory.
  Never hand-edit or commit the generated files.
- Use plain, human copy with sentence-case headings. Avoid hype, gradients,
  decorative cards, and oversized empty hero sections.
- Keep client-side JavaScript limited to real interactions: the install
  picker, the Alpine agent demo on the home page, and Starlight's built-in
  search and theme controls.
- The home page agent demo (`src/components/AgentDemo.astro` plus
  `src/scripts/agent-demo.ts`) must only show real commands from the shipped
  CLI catalog and stay labelled as example data.
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
