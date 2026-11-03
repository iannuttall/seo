# Step 5 of 10: build

Goal: the site runs from the starter, deploys to a private preview on
Cloudflare and passes `seo site check`.

## Start the site

If the project does not exist yet, create it in a new folder:

```sh
seo site new <folder> --name "<Site name>" --domain <domain>
cd <folder>
pnpm build
```

The starter is a static Astro site on Cloudflare Workers static assets. It
already does the parts every page needs:

- One layout (`src/layouts/Base.astro`) writes the title, description,
  canonical, sharing tags and one JSON-LD graph per page.
- A Markdown copy of every page, `llms.txt` and `agent-routes.json`, from
  `agentMarkdown()`.
- A sharing image for every page, drawn at build time from its H1.
- A sitemap index with files of up to 5,000 URLs, listed in `robots.txt`.
- `robots.txt` open to every crawler, with a Content-Signal line. Set
  `aiTraining` in `site.config.json` to the person's choice.
- `pnpm build` ends with `seo site check`, so a broken build never ships.

## Use the components

The starter has a clean blank theme for the person to make their own.
`AGENTS.md` lists the components: header, footer, page header,
breadcrumbs, section heading, cards with a destination label, fact table,
FAQ accordion, buttons, form inputs, code block and `site-prose` text.
Build every page from them. Make a new component only for something none
of them shows, in the same style: token classes from
`src/styles/globals.css`, muted panels, no borders, shadows or raw
colours. Change the look by changing the tokens, never page by page.

## Deploy a private preview

1. Create a GitHub repository and push: `gh repo create --private --source
   . --push`.
2. In the Cloudflare dashboard, open Workers & Pages, create an
   application, import the repository and keep the build command
   `pnpm build`. Set the deploy command to `pnpm run deploy`.
3. Until launch the site lives on its workers.dev address. Protect it with
   Cloudflare Access (in the Worker's settings, under Domains & Routes,
   turn on Cloudflare Access for workers.dev) so only the person can open
   it. Never use noindex for this: it is too easy to forget.
4. Send the person the preview link and a screenshot of the home page on
   desktop and phone.

## Rules

- Static first. Run code on the server only for a route that needs it,
  such as a search box over a large dataset, and keep it under `/api/*`.
  Never set `run_worker_first` for anything else.
- Every word of content and the H1 is in the built HTML. Most AI systems
  do not run JavaScript.
- One URL form everywhere: no trailing slash, and canonicals drop query
  strings.
- Missing pages return a real 404. Never redirect them to the home page.
- Keep the data in committed JSON or R2. Never query a database on a page
  request.

Done when: the preview is live behind Cloudflare Access, `pnpm build`
passes and the person has seen the screenshots.

Next: `seo site guide golden-page`
