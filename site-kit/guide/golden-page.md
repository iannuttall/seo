# Step 6 of 10: golden page

Goal: one page that is the best answer on the web for its search, built
from real data before any template exists.

## What the agent does

1. Build the first page of the main page type with real data, in the page
   template the plan names. The starter's park page
   (`src/pages/parks/[slug].astro`) shows the shape.
2. Take screenshots on desktop, at phone width and in dark mode. Review
   them against the rules below before the person sees them.
3. Show the person the screenshots and the preview link, then change the
   page from their feedback until they approve it.

## What the person does

Judge the page as a user, not as a builder. Do I know what this is at a
glance? Does it answer my question? Is every part there for a reason?
Would I send it to a friend who asked?

## How a good page is laid out

- A clear H1 and a short answer at the top that makes sense on its own.
  Never "see below".
- The tool or the main data next, then a well designed table of the
  details.
- A fact block for each set of facts, with the source and the checked date
  (`src/components/FactTable.astro`).
- Questions people really ask, answered on the page. The FAQ markup
  repeats them word for word, which `seo site check` tests.
- Links to related pages in the body, with words that name the page they
  lead to. One link per target per page, never in the H1.
- Assumptions and caveats at the bottom, in plain words.

Charts, maps and calculators earn their place when they help. Every chart
also has its data in a table and a sentence that says what it shows.

## Design rules

Simple and quiet. The system font or Inter, plenty of space, one link
colour. `seo site check` fails the build on uppercase or letter-spaced
labels, gradients, shadows, coloured left borders and card grids wider
than two columns. Also avoid stat boxes, eyebrow labels above headings and
slogans made of three short phrases. Attention to detail is what
separates a good page: capitals, units, plurals and empty states.

Done when: the person approves the page and `pnpm build` passes.

Next: `seo site guide writing`
