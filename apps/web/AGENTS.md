# Site agent notes

The Astro site for `https://seoskill.dev`. Pages are static. A small Hono
Worker serves the assets and only `/api/t`, `/api/stats`, `/api/founder`
and bounded `/api/tools/*` jobs. Read the root `CONTENT.md` in the same task before you
write any site copy, metadata included.

## Rules

- The hosted MCP Worker (`apps/mcp`) owns `/mcp`, `/mcp/*`, `/oauth/*`,
  `/account`, `/account/*` and `/.well-known/oauth-*`. Never publish site
  pages on those paths. The account page is drawn from this site's
  `/account-shell` page; its state and cookie belong to the MCP Worker.
- One site cookie, `seo_first`, set once by `BaseLayout.astro` on a first
  visit: the referring host, landing path and `utm_*` tags, for the hosted
  MCP to record where a new person came from.
- The design is copied from Ian's ilo web app: tokens in
  `src/styles/globals.css`, soft `bg-muted` panels, no borders or shadows.
  Do not bring back the old brutalist look. Never use uppercase text: no all-caps eyebrows,
  kickers, labels or headings, and no letter-spaced small caps. Use sentence
  case. Card grids have two columns at most. Linked cards end with a label
  that says where they go. Reuse the components in
  `src/components` (and `docs-prose` for docs) before writing new markup.
  `src/components/ui` is ilo's Kiwa UI kit (checkbox, input, select,
  badge, card, accordion, toggle group, lucide icons); use it for new
  controls instead of hand-styled elements.
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
- Copy says what the product gives today. No "coming next", no earlier
  versions of the product, and no sections built on what other tools get
  wrong.
- Keep implementation terms (field names, limits, registry words) out of
  public copy.
- All internal links are relative.
- After a visual change, look at the rendered page on desktop, phone width
  and dark mode. A passing build does not prove the layout.

## Blog posts

- Read `POSITIONS.md` before you write or edit a post. A post agrees with
  every stance in it; a new or changed stance goes into it in the same PR,
  and a changed stance updates every post it lists.
- Answer each `seo lint` review item, `absolute` especially: narrow the
  claim to what its source shows, or say it's Ian's view.
- Before a post is published, and before a published post's claims change,
  get a sceptical review from a separate reviewer (a subagent) that hasn't
  seen the drafting. Give it the draft, `POSITIONS.md`, the live posts on
  the same topic and the post's sources, and don't tell it the post is
  right. Ask it for each claim that contradicts a position or another live
  post, goes further than its source, gives a number without a source, or
  is advice one post gives and another post argues against. Fix each
  finding or record why it stands before publishing.

## Blog covers

Every post's cover (`public/blog/covers/<slug>.webp`, 1200 by 630) is an
illustrated scene in the post's chosen style, drawn as if it were real:

- Correct perspective: one consistent viewpoint, objects sized and
  foreshortened for where they sit, and light from one direction.
- Physical sense: hands grip objects the way a person would, and a
  magnifying glass sits between the eye and what it looks at, lens facing
  the page.
- Anything a person reads faces them. The printed side of a newspaper,
  leaflet, book or screen points at their eyes, never at the viewer.
- No legible text in the art.
- Before using a cover, look at it at full size and check hands, held
  objects, gaze and which way pages face. Regenerate it when any of them is
  wrong; don't publish a cover that only works at thumbnail size.

## Checks

```sh
pnpm build:web
pnpm --filter @seo/web typecheck
pnpm --filter @seo/web test
pnpm deploy:web:dry-run
```
