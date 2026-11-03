# Step 2 of 10: market

Goal: a niche with real search demand and data the site can own, where the
pages that rank today are weak. The step ends with a plan file and a go or
no-go from the person.

## What the agent does

1. Ask the person for the idea, in their words. Good ideas come from their
   own life and hobbies, open data, forums, and sites that look weak.
2. Find the head term and its modifiers. Searches usually take the shape
   head term plus modifier, such as "{club} {season} home shirt".
3. Read the live search results for each pattern: who ranks, what kind of
   page wins (tool, list, directory item, guide) and how strong those sites
   look.
4. With a keyword data key, get the numbers:

   ```sh
   seo research keyword_metrics --keywords "<term>,<term>"
   seo research serp --keywords "<head term>"
   seo research competitors --target <a competitor domain>
   seo research ranked_keywords --target <a competitor domain>
   ```

   Then look at the competitors of those competitors for pockets of
   demand. Without a key, use the search results, autocomplete and "people
   also ask", and say that the volumes are unknown.
5. Write `plan.md` in the project with the head terms, the modifiers, who
   ranks, the data sources, how often the data changes, the page types and
   a page count estimate.

## What the person does

Read `plan.md` and say go or no-go. Their judgement of the market matters
more than any number.

## Signs a market is winnable

- Forum threads, thin directories or old pages in the top results.
- Sites with few links and low authority ranking on page one.
- Searches with buyers behind them. 100 searches from people about to buy
  beat 4,400 from people who want something free. A real cost per click
  shows the market pays.

## Walk away when

- The data is too hard to get, too hard to keep current or too costly to
  host.
- Every result is a household brand with years of links.
- The only pages you could make are thin rewrites of one source.

Build five ideas to find one that works. A quiet, boring market is fine.

Done when: `plan.md` names the head terms, the page types, the data
sources and a page count, and the person said go.

Next: `seo site guide data`
