# Site kit

The files behind `seo site`. They ship in the npm package.

- `starter/` is the Astro site on Cloudflare that `seo site new <folder>`
  copies. `gitignore` becomes `.gitignore` in the copy, because npm drops
  `.gitignore` files from packages.
- `guide/` holds one Markdown file per step that `seo site guide <step>`
  prints. The list and order of steps is `SITE_GUIDE_STEPS` in
  `packages/cli/src/commands/site.ts`.

`seo site check` lives in `packages/core/src/site-check`. Change the starter
and the check together: the starter's own build must pass the check.
