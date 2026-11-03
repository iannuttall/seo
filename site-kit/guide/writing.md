# Step 7 of 10: writing

Goal: copy a person enjoys reading and an AI answer can lift out and quote
correctly.

## What the agent does

1. Write in two passes. First collect the facts for a page from the data
   and its sources. Then write only from those facts.
2. Put sentences that depend on the data in `src/lib/narrative.ts`. Each
   sentence is shown only when its fact exists, and the wording changes
   with the numbers, so pages read differently.
3. Check every claim against its source before it ships.
4. Run `pnpm build`. `seo site check` fails on the copy rules below.

## What the person does

Plan the sections of the main page type, because sections an AI plans come
out generic. Read a few pages like a visitor, and turn every pattern they
dislike into a rule.

## Rules for people

- Clear, direct, full sentences. Say what the reader gets.
- The length is whatever answers the question. No word count targets, and
  no "what is X" opening when the reader already knows.
- The title tag is for the search result: the words people search for
  first, short enough not to be cut off. The H1 says the same thing in
  plainer words.
- Questions in an FAQ come from real searches or common sense.
- Never write about the build, the tools, collecting data, search terms or
  "coming soon".

`seo site check` fails on: dashes used as punctuation, semicolons, "it's
not X, it's Y" lines, hype words such as seamless, robust and unlock,
openings such as "in this guide" and "did you know", tool and process
words, and "coming soon". When a banned word is part of the subject (a
site about Cloudflare, say), add it to `allowWords` in `site.config.json`.

## Rules for being quoted

- Every section answers on its own. Name the subject, give the answer in
  the first sentence or two, then the conditions. Test it by reading the
  section alone.
- Write H2s the way people ask.
- Keep each number next to its source and date, in visible text.
- Credit the site's own figures by name: "{Site}'s data shows", never "our
  data".
- One strong page per claim. Keep price and other fast moving pages fresh,
  with a visible date.

Done when: every section passes the read-it-alone test, the facts match the
sources and `pnpm build` passes.

Next: `seo site guide scale`
