# Step 10 of 10: grow

Goal: know what is working from the site's own data, improve one thing at
a time, and keep the data current with minutes of the person's time a
week.

## Measure every week

Search Console data starts a few days after launch. Run the report each
week and treat each section as a list to review, never a forecast:

```sh
seo report --site <domain>
seo report --site <domain> --section quick-wins
seo report --site <domain> --section striking-distance
seo report --site <domain> --section ai-queries
seo index --site <domain>
```

- Quick wins and low CTR: pages near the top with fewer clicks than their
  position should get. Review the title and description.
- Striking distance and second page: pages close to page one. Improve the
  section that answers the search.
- AI queries: long questions people ask, which may need a section or an
  FAQ answer.
- Content decay and traffic drop: what lost clicks, and the Google updates
  around that date.
- `seo index`: why Google left pages out of its index.

Use `seo page --url <url>` for one page's searches and status. Your own
Search Console data is the only data that is about your site. Keyword
tools are estimates.

## Change one thing at a time

Note the date and what changed. Compare equal windows four and eight weeks
later with `seo compare --site <domain> --date <date>`. A change in the
same week as a Google update proves nothing on its own.

## Keep the data current

- The refresh workflow opens a pull request when a source changes. The
  person checks the numbers and merges it.
- When a refresh fails, find out why and fix the import, then let the next
  run open the pull request.

## Become known

Keep the name and description the same on the site, in its JSON-LD and on
every profile. Publish the site's own data and statistics, because those
are what people link to and AI answers cite. Never buy links or post fake
mentions.

At six months, a steady few hundred visits a day means keep going. Much
less means rebuild it smaller and better, or try the next idea.

Done when: the weekly report runs, and each item has an action or a clear
"no action".
