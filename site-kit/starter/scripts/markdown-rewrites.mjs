// Prints the two Cloudflare URL rewrite rules that answer
// `Accept: text/markdown` at a page's normal URL with its Markdown copy.
// Add them under Rules > Transform Rules > Rewrite URL for the zone.
// Rewrite rules run before the static assets, so no Worker code runs and
// bots cost nothing (never use run_worker_first for this).
import config from '../site.config.json' with { type: 'json' }

const host = `http.host eq "${config.domain}"`
const method = '(http.request.method eq "GET" or http.request.method eq "HEAD")'
const accept =
  '(starts_with(lower(http.request.headers["accept"][0]), "text/markdown"))'

const rules = [
  {
    name: 'Markdown copy of the home page',
    expression: `(${host} and ${method} and http.request.uri.path eq "/" and ${accept})`,
    rewrite: 'Static: /index.md',
  },
  {
    name: 'Markdown copy of every other page',
    expression: `(${host} and ${method} and http.request.uri.path ne "/" and not ends_with(http.request.uri.path, "/") and not (http.request.uri.path contains ".") and ${accept})`,
    rewrite: 'Dynamic: concat(http.request.uri.path, ".md")',
  },
]

for (const rule of rules) {
  console.log(
    `${rule.name}\n\nWhen incoming requests match (Edit expression):\n${rule.expression}\n\nThen rewrite the path to:\n${rule.rewrite}\n\nQuery: preserve\n`,
  )
}
console.log(
  `Check it after the next deploy:\ncurl -sI -H "Accept: text/markdown" https://${config.domain}/ | grep -i content-type`,
)
