# Step 3 of 10: data

Goal: a clean dataset that is hard to copy, with a source and a checked
date for every fact, rebuilt from scratch by one command.

The data is what makes the site worth visiting. A site built on one copied
dataset gets no traction. Data that is combined, cleaned and worked out
into something new does.

## What the agent does

1. Find sources in this order: government and open data, then public pages
   that can be collected, then data people add themselves. Check each
   source's licence and terms before using it.
2. Write the import as a script that gives the same result every run, such
   as `scripts/build-data.mjs`, from raw files in `data/raw` to JSON in
   `src/data`. It reports any name it cannot match instead of guessing.
3. Join and enrich the sources: clean names, units and plurals, add places
   and work out comparisons or a score. Formatting is a quality signal, so
   "LLC" never becomes "Llc".
4. List every source in `src/data/sources.json` with its URL and the date
   it was checked. `pnpm data:refresh` records each source's ETag, date and
   hash, so a change opens a pull request.
5. Add a rule to `scripts/validate-data.mjs` for each kind of mistake the
   data can contain, and run `pnpm data:validate`.
6. Replace the example parks data and the parks pages as the plan says.

## What the person does

- Decide how often the data is refreshed. Ask how often it changes at the
  source before anything is built: daily for tides, yearly for statistics.
  Set the cron in `.github/workflows/refresh-data.yml` to match.
- Spot-check 20 rows like an expert in the subject.

## Rules

- Keep an unknown value unknown. Never guess opening hours, rules or
  prices. Store facts and work totals out from them.
- Never use a competitor as the source.
- Money and health numbers change only through a pull request a person
  reviews. The refresh workflow does this for you.
- A score or index the site owns, explained on a methodology page, makes
  pages worth linking to.

Done when: the dataset builds from nothing with one command, every fact
has a source and a checked date, `pnpm data:validate` passes and the
refresh workflow is scheduled.

Next: `seo site guide plan`
