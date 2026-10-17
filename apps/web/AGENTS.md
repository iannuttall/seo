# Site agent notes

The Astro site for `https://seoskill.dev`. Pages are static. A small Hono
Worker serves the assets and only `/api/t`, `/api/stats` and bounded
`/api/tools/*` jobs. Read the root `CONTENT.md` in the same task before you
write any site copy, metadata included.

## Rules

- The hosted MCP Worker (`apps/mcp`) owns `/mcp`, `/mcp/*`, `/oauth/*`,
  `/account`, `/account/*` and `/.well-known/oauth-*`. Never publish site
  pages on those paths. The account page is drawn from this site's
  `/account-shell` page; its state and cookie belong to the MCP Worker.
- No other accounts, cookies, analytics or hosted surfaces without Ian's
  decision.
- The design is copied from Ian's ilo web app: tokens in
  `src/styles/globals.css`, soft `bg-muted` panels, no borders or shadows.
  Do not bring back the old brutalist look. Reuse the components in
  `src/components` (and `docs-prose` for docs) before writing new markup.
- Docs order, index, breadcrumbs, sitemap and llms.txt all come from
  `src/content/docs-nav.mjs`. The `seo index` page is
  `/docs/commands/indexing` because Cloudflare folds `/index` paths.
- When a URL changes, add a permanent redirect. Report ids in
  `src/content/telemetry/report-ids.mjs` are never removed: old clients
  still send them, and they drive redirects in `public/_redirects`.
- Sharing images are drawn at build time (`src/lib/og-images.ts`). No
  third-party image service.
- Privacy and terms render from the root Markdown files. No security or
  trademark page. Support goes to GitHub Issues; no email address on the
  site.
- `/.well-known/agent-skills/` is generated from `skills/`. Never hand-edit
  or commit it.
- Teach `npm i -g seo` then `seo start`, and the hosted MCP next to it. Keep
  hosted facts in step with `apps/mcp/README.md`. Credit Domain Rating as
  Domain Rating by Ahrefs with a link.
- Keep implementation terms (field names, limits, registry words) out of
  public copy.
- All internal links are relative.
- After a visual change, look at the rendered page on desktop, phone width
  and dark mode. A passing build does not prove the layout.

## Checks

```sh
pnpm build:web
pnpm --filter @seo/web typecheck
pnpm --filter @seo/web test
pnpm deploy:web:dry-run
```
