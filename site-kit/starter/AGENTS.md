# Agent notes

This site was made with `seo site new`. It is a static Astro site on
Cloudflare Workers static assets, built from the data in `src/data`.

Work one step at a time. Print the instructions for a step with
`seo site guide <step>`: setup, market, data, plan, build, golden-page,
writing, scale, launch, grow. Follow the step, then show the person the
result before the next one.

`pnpm build` runs `seo site check`, and Cloudflare will not deploy a build
that fails it. Fix the page, the template or the data, never the check.
When a word the copy rules ban is part of the site's subject, add it to
`allowWords` in `site.config.json`.

## Components

The design matches a clean blank theme: Tailwind 4, Inter and JetBrains
Mono, soft `bg-muted` panels with no borders or shadows, and automatic
light and dark mode. Reuse these before writing new markup:

- `Header.astro`, `Footer.astro`: links come from `nav` and `footerLinks`
  in `src/site.ts`.
- `PageHeader.astro`: the H1 and the one-paragraph answer under it.
- `Breadcrumbs.astro`: drawn by the layout from its `breadcrumbs` prop.
- `SectionHeading.astro`: an H2 with a short line of text.
- `Card.astro`: a muted panel with an icon, title and text. A linked card
  takes `link`, a label that says where it goes. Put cards in
  `grid grid-cols-1 gap-2 sm:grid-cols-2`.
- `FactTable.astro`: facts with their source and checked date.
- `FaqAccordion.astro`: questions and answers. Pass the same list to the
  layout's `faqs` prop.
- `Button.astro` (and `ui/button.ts`), `FormInput.astro`,
  `FormSelect.astro`, `CodeBlock.astro`, `HugeIcon.astro`, `Logo.astro`.
- `site-prose`: put it on an `<article>` for plain headings, paragraphs,
  lists and tables.

Every colour comes from `src/styles/globals.css`. Use token classes such
as `bg-muted`, `text-foreground`, `text-foreground-muted` and
`text-primary`. `seo site check` fails on raw colours (`#fff`, `rgb()`,
`bg-blue-600`) and on `<style>` blocks in pages, components and layouts,
so the theme changes in one place. To restyle the site, change the tokens
there, the mark in `Logo.astro` and `public/favicon.svg`, and the card
colours in `src/lib/og/card.ts`.

## Where things live

- `site.config.json`: the site name, domain, description and choices.
- `src/data`: the dataset and its sources, each with a checked date.
- `src/lib/narrative.ts`: page prose built from facts in the data.
- `src/layouts/Base.astro`: the title, canonical, sharing tags and JSON-LD.
- `src/components`: the components listed above.
- `src/styles/globals.css`: the theme, the only place for colours.
- `src/integrations`: sharing images and sitemaps, drawn from the build.
- `scripts`: data refresh and validation, deploy with IndexNow, and the
  Markdown rewrite rules.

## Never

- Never add noindex to a page people should find. Protect previews with
  Cloudflare Access instead.
- Never guess a fact. Keep an unknown value unknown and say so on the page.
- Never use `run_worker_first` for Markdown copies.
- Never change a live URL without a 301 to the closest page.
- Never write about the build, the tools or search terms in page copy.
