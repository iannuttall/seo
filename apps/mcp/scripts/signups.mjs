// Where people who signed up to the hosted MCP came from, as counts only:
// pnpm --filter @seo/hosted-mcp run signups
// Reads the remote seo-mcp D1 database with wrangler (add --local for the
// local one). Never prints a row for one person.

import { spawnSync } from 'node:child_process'

const where = process.argv.includes('--local') ? '--local' : '--remote'

const site = `CASE
  WHEN landing_path IS NULL THEN '(no site visit)'
  WHEN referrer_host IS NULL THEN '(direct)'
  ELSE referrer_host END`

const queries = [
  [
    'People and sign-ups with a source',
    `SELECT (SELECT COUNT(*) FROM users) AS people,
       (SELECT COUNT(*) FROM signup_sources) AS with_source`,
  ],
  [
    'Sign-ups by day (UTC, last 60 days)',
    `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS signups,
       SUM(entry = 'mcp') AS mcp, SUM(entry = 'web') AS web, SUM(entry = 'cli') AS cli
     FROM signup_sources GROUP BY day ORDER BY day DESC LIMIT 60`,
  ],
  [
    'By entry',
    `SELECT entry, COUNT(*) AS signups FROM signup_sources
     GROUP BY entry ORDER BY signups DESC, entry`,
  ],
  [
    'By client',
    `SELECT entry, COALESCE(client, '(unknown)') AS client,
       COALESCE(client_name, '') AS client_name, COUNT(*) AS signups
     FROM signup_sources GROUP BY 1, 2, 3 ORDER BY signups DESC, 1, 2, 3 LIMIT 50`,
  ],
  [
    'MCP and CLI user agents',
    `SELECT entry, COALESCE(user_agent, '(none)') AS user_agent, COUNT(*) AS signups
     FROM signup_sources WHERE entry IN ('mcp', 'cli')
     GROUP BY 1, 2 ORDER BY signups DESC, 1, 2 LIMIT 30`,
  ],
  [
    'By referring site (first visit to seoskill.dev)',
    `SELECT ${site} AS referrer, COUNT(*) AS signups FROM signup_sources
     GROUP BY 1 ORDER BY signups DESC, 1 LIMIT 50`,
  ],
  [
    'By landing page',
    `SELECT landing_path, COUNT(*) AS signups FROM signup_sources
     WHERE landing_path IS NOT NULL
     GROUP BY 1 ORDER BY signups DESC, 1 LIMIT 30`,
  ],
  [
    'By utm_source, utm_medium and utm_campaign',
    `SELECT utm_source, COALESCE(utm_medium, '') AS utm_medium,
       COALESCE(utm_campaign, '') AS utm_campaign, COUNT(*) AS signups
     FROM signup_sources WHERE utm_source IS NOT NULL
     GROUP BY 1, 2, 3 ORDER BY signups DESC, 1, 2, 3 LIMIT 30`,
  ],
]

for (const [title, sql] of queries) {
  const run = spawnSync(
    'wrangler',
    ['d1', 'execute', 'seo-mcp', where, '--json', '--command', sql],
    { encoding: 'utf8' },
  )
  if (run.status !== 0) {
    process.stderr.write(run.stderr || run.stdout || 'wrangler failed\n')
    process.exit(run.status ?? 1)
  }
  console.log(`\n${title}`)
  console.table(JSON.parse(run.stdout)[0]?.results ?? [])
}
