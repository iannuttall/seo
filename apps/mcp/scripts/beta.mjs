// Grants, revokes and lists beta features on hosted accounts. Maintainers
// only; nothing a person does on seoskill.dev writes a flag.
//
// pnpm --filter @seo/hosted-mcp beta list
// pnpm --filter @seo/hosted-mcp beta grant <google email> <flag>
// pnpm --filter @seo/hosted-mcp beta revoke <google email> <flag>
//
// The account is found by a Google email linked to it. Runs against the
// remote seo-mcp D1 database with wrangler; add --local for the local one.

import { spawnSync } from 'node:child_process'
import { BETA } from '../src/beta.ts'

const args = process.argv.slice(2).filter((arg) => arg !== '--local')
const where = process.argv.includes('--local') ? '--local' : '--remote'
const [action, email, flag] = args

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function sql(command) {
  const run = spawnSync(
    'wrangler',
    ['d1', 'execute', 'seo-mcp', where, '--json', '--command', command],
    { encoding: 'utf8' },
  )
  if (run.status !== 0) fail(run.stderr || run.stdout || 'wrangler failed')
  return JSON.parse(run.stdout)[0]?.results ?? []
}

// wrangler d1 execute takes no bound values, so text is quoted here. Emails
// and flags are checked first, so this only ever doubles a quote.
const quote = (value) => `'${value.replaceAll("'", "''")}'`

if (action === 'list') {
  console.table(
    sql(`SELECT f.flag, f.user_id,
       (SELECT group_concat(a.label, ', ') FROM accounts a
        WHERE a.user_id = f.user_id AND a.provider = 'google') AS google,
       datetime(f.granted_at / 1000, 'unixepoch') AS granted
     FROM beta_flags f ORDER BY f.flag, f.granted_at, f.user_id`),
  )
  process.exit(0)
}

if ((action !== 'grant' && action !== 'revoke') || !email || !flag) {
  fail(
    'Usage: beta.mjs list | grant <google email> <flag> | revoke <google email> <flag> [--local]',
  )
}
if (!Object.hasOwn(BETA, flag)) {
  fail(`Unknown flag "${flag}". Flags: ${Object.keys(BETA).join(', ')}.`)
}
if (!/^[^\s@']+@[^\s@']+$/.test(email)) fail(`"${email}" is not an email.`)

const users = sql(
  `SELECT DISTINCT user_id FROM accounts
   WHERE provider = 'google' AND lower(label) = lower(${quote(email)})`,
)
if (users.length !== 1) {
  fail(
    users.length
      ? `${email} is linked to ${users.length} accounts; grant by hand.`
      : `No account has the Google account ${email}.`,
  )
}
const userId = users[0].user_id

if (action === 'grant') {
  sql(
    `INSERT INTO beta_flags (user_id, flag, granted_at)
     VALUES (${quote(userId)}, ${quote(flag)}, ${Date.now()})
     ON CONFLICT (user_id, flag) DO NOTHING`,
  )
  console.log(`Granted ${flag} to ${email} (${userId}).`)
} else {
  sql(
    `DELETE FROM beta_flags WHERE user_id = ${quote(userId)} AND flag = ${quote(flag)}`,
  )
  console.log(`Revoked ${flag} from ${email} (${userId}).`)
}
