# Step 9 of 10: launch

Goal: the site is live on its domain, Google and Bing know about it, and
the most important pages are found quickly.

## What the agent does

1. Add the domain to `wrangler.jsonc` and push:

   ```jsonc
   "routes": [{ "pattern": "<domain>", "custom_domain": true }]
   ```

   Redirect `www` to the bare domain with a Cloudflare redirect rule.
   Take Cloudflare Access off the live domain.
2. Add the two Markdown rewrite rules, so an agent that asks for
   `Accept: text/markdown` at a normal URL gets the Markdown copy. Print
   them with `pnpm rewrites` and add them in the Cloudflare dashboard under
   Rules, URL rewrite. They run before the site, so no code runs per
   request.
3. Check production: the home page, a page of each type, `robots.txt`,
   `sitemap.xml`, `llms.txt`, a sharing image, a 404 and a Markdown
   request:

   ```sh
   seo crawl --url https://<domain>
   curl -sI -H "Accept: text/markdown" https://<domain>/
   ```

4. From now on `pnpm run deploy` (the Cloudflare deploy command) sends the
   pages that changed to IndexNow after each deploy.
5. Pick the 100 most important URLs: hubs, the pages with the most data
   and the pages that link to everything else. Check each one is built,
   canonical and in a sitemap.

## What the person does

1. Add the domain to Google Search Console as a Domain property and
   verify it through Cloudflare. Submit `https://<domain>/sitemap.xml`.
2. Import the site into Bing Webmaster Tools from Search Console.
3. Add Clicky, on the production domain only.
4. Run `seo start` again if the new property should show up in SEO Skill.

## Rules

- Publish every page at once. A site built for people does not drip feed
  pages.
- Found is not indexed. Expect impressions within days if the site is
  good, and judge it at six months.
- Never change a live URL without a 301 to the closest page.

Done when: the domain serves the site, Search Console and Bing have the
sitemap, and `seo crawl` reports no errors.

Next: `seo site guide grow`
