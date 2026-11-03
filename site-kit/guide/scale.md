# Step 8 of 10: scale

Goal: every page as good as the golden page.

## What the agent does

1. Turn the golden page into the template for its page type. Each block
   shows only when the data has enough for it.
2. Build every page, then screenshot a sample of each page type: the
   pages with the most data, the least data and the strangest data.
3. Review the sample with a second agent that did not build it.
4. Link the pages in the build: hubs to their pages, pages to their
   siblings, and every page within three clicks of the home page.
   `seo site check` fails on pages nothing links to.
5. Update `llms.config.mjs` so `llms.txt` lists the hubs and page types.

## What the person does

Review the sample from every page type, most of all the pages with the
least data. A thin page gets better data, gets merged into a stronger page
or is not built.

## Rules

- Fix a problem in the template or the data, never page by page. Fixing
  pages one at a time hides the real fault.
- Reuse the starter's components. Do not invent a new one for each page
  type.
- Rigid templates with thin data make bad pages. Leave a block out rather
  than fill it with filler.
- `seo site check` checks every page before deploy: titles and
  descriptions present, unique and the right length, one H1, canonicals,
  JSON-LD, FAQ markup that matches the page, links that work, every page in
  a sitemap, no noindex, a sharing image and a Markdown copy for each page,
  the copy and design rules, and a source and date on every fact block.
  It stops at 10,000 pages.

Done when: a random sample of pages passes the person's review and
`pnpm build` passes.

Next: `seo site guide launch`
