# Step 4 of 10: plan

Goal: a page list where every page has real demand and one clear job, and
the domain to put it on.

## What the agent does

1. Map each search pattern to a page type and a URL pattern.
2. Check the demand for each page type before building it. With a keyword
   data key, run `seo research keyword_metrics` on a sample of each
   pattern. Without one, check that the search results show pages of that
   type.
3. Group searches that share the same top results into one page, so pages
   never compete with each other.
4. When the data allows two sizes, propose both (for example about 700
   pages or about 9,000) and let the person choose by risk.
5. Add a route list to `plan.md`: page type, URL pattern, target search
   pattern and expected count.
6. Suggest three domains: two words, no hyphens, about the subject. Check
   they are free on Cloudflare Registrar.

## What the person does

Approve the page list and the URL pattern, then buy the domain on
Cloudflare Registrar. Then put the domain in `site.config.json`.

## Rules

- Use the smallest page type that fully answers the search: a tool, a
  landing page, then a guide.
- Every search intent gets one URL. Never make a second page for the same
  job.
- Small and focused wins: hundreds of rich pages, never tens of thousands
  of thin ones. Directories are the exception, because people search for
  each item by name.
- Long variants of a search become sections on one strong page. They do
  not get thin pages of their own.
- Never make one page per question or per wording of a search. Google
  treats that as scaled content abuse.
- Build a page only when the data has enough to make it useful. A URL that
  does not qualify is never built.
- URLs are lowercase and lead with the subject, one or two folders deep,
  with no IDs, no source names and no trailing slash.
- Hub pages are real pages with their own data, not lists of 500 links.

Done when: `plan.md` has the route list, the person approved it, and the
domain is bought and set in `site.config.json`.

Next: `seo site guide build`
