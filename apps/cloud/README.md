# Cloud crawler proof of concept

Not deployed and not part of the product. It tests one design for the hosted
weekly crawl: one SQLite Durable Object per site that crawls in batches of up
to 200 pages per alarm, with D1 holding only the schedule and one summary row
per site.

Run it locally against the generated test site:

```sh
cd apps/cloud
echo 'POC_TOKEN=local' > .dev.vars
npx wrangler d1 migrations apply seo-cloud-poc --local
PAGES=500 node scripts/fixture.mjs 8788 &
npx wrangler dev --port 8787 --test-scheduled &
node scripts/measure.mjs '{"site":"s500","pages":500,"run":{"maxPages":1000,"inspectLimit":200}}'
```

`measure.mjs` prints wake-ups, alarms, requests, rows read and written,
storage, wall time and findings for one run. Run it again with the same
`site` and `"week":2` to see what changed since the first run.
