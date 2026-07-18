#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

const DEFAULTS = {
  cloudProject: 'seo-mcp-498117',
  property: '123456789',
  project: 'oauth-verification-demo',
  site: 'sc-domain:seoskill.dev',
  url: 'https://seoskill.dev',
}

function usage() {
  process.stdout.write(`Run the Google OAuth verification demo with the published seo command.

Usage:
  node scripts/oauth-verification-demo.mjs [options]

Options:
  --cloud-project <id>  Google Cloud project id (${DEFAULTS.cloudProject})
  --property <id>       Google Analytics property id (${DEFAULTS.property})
  --project <id>        Temporary saved project id (${DEFAULTS.project})
  --site <property>     Search Console property (${DEFAULTS.site})
  --url <url>           Crawl URL (${DEFAULTS.url})
  --change-date <date>  Date used for the before and after report
  --skip-setup          Keep an existing project profile instead of recreating it
  --print               Print the scenes and commands without running them
  --help                Show this help

The runner opens the review pages, pauses for narration, and invokes the globally
installed seo package. Browser consent and the readable permission screen remain
manual so the recording clearly shows what the reviewer needs to inspect.
`)
}

function dateDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    changeDate: dateDaysAgo(21),
    print: false,
    skipSetup: false,
  }
  const keys = {
    '--cloud-project': 'cloudProject',
    '--property': 'property',
    '--project': 'project',
    '--site': 'site',
    '--url': 'url',
    '--change-date': 'changeDate',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') return { help: true }
    if (arg === '--print') {
      options.print = true
      continue
    }
    if (arg === '--skip-setup') {
      options.skipSetup = true
      continue
    }
    const key = keys[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value.`)
    }
    options[key] = value
    index += 1
  }

  if (!/^\d+$/.test(options.property)) {
    throw new Error(
      '--property must be a numeric Google Analytics property id.',
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.changeDate)) {
    throw new Error('--change-date must use YYYY-MM-DD.')
  }
  new URL(options.url)
  return options
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=,-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`
}

function commandText(command, args) {
  return [command, ...args].map(shellQuote).join(' ')
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  usage()
  process.exit(0)
}

const reader = createInterface({ input: stdin, output: stdout })
let sceneNumber = 0

function heading(title) {
  sceneNumber += 1
  process.stdout.write(
    `\n\nScene ${sceneNumber}: ${title}\n${'='.repeat(title.length + 9)}\n`,
  )
}

async function pause(message = 'Press Enter to continue.') {
  if (options.print) return
  await reader.question(`\n${message} `)
}

function cue(text) {
  process.stdout.write(`\nTalk over:\n${text}\n`)
}

async function run(command, args, text) {
  process.stdout.write(`\n$ ${commandText(command, args)}\n`)
  if (options.print) return
  if (text) await pause(text)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Command stopped with exit code ${result.status}.`)
  }
}

function openPages(urls) {
  for (const url of urls) process.stdout.write(`\nOpen: ${url}`)
  process.stdout.write('\n')
  if (options.print || process.platform !== 'darwin') return
  const result = spawnSync('open', urls, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.stdout.write('Open the URLs above manually.\n')
  }
}

try {
  heading('Check the production command')
  cue(
    'This is the published seo package using the OAuth client submitted for verification.',
  )
  await run(
    'seo',
    ['--version'],
    'Start the screen recording, then run the version check.',
  )

  heading('Show the submitted app and policies')
  openPages([
    `https://console.cloud.google.com/auth/overview?project=${encodeURIComponent(options.cloudProject)}`,
    `https://console.cloud.google.com/auth/clients?project=${encodeURIComponent(options.cloudProject)}`,
    `https://console.cloud.google.com/auth/scopes?project=${encodeURIComponent(options.cloudProject)}`,
    'https://seoskill.dev/',
    'https://seoskill.dev/privacy',
  ])
  cue(
    "Show the project id, app name, OAuth client id, and exact configured scopes. Do not show a client secret. Then show that Google data stays on the user's computer, how local files are protected, how long data is kept, and the deletion commands.",
  )
  await pause('Show each browser tab clearly, then press Enter.')

  heading('Remove the previous grant')
  openPages(['https://myaccount.google.com/connections'])
  cue(
    'Remove the existing SEO Skill connection so Google displays the complete permission grant again.',
  )
  await pause(
    'Revoke the existing connection in the browser, then press Enter.',
  )
  await run('seo', ['auth', 'logout'], 'Run the local logout.')
  await run(
    'seo',
    ['auth', 'status'],
    'Show that no local Google token remains.',
  )

  heading('Show the complete consent flow')
  cue(
    'SEO Skill requests read-only Search Console and Google Analytics access. On the Google screen I will expand Show all services so every requested scope is readable.',
  )
  await run(
    'seo',
    ['auth', 'login'],
    'Run login. In the browser, show every screen and expand the complete permission list before approving.',
  )
  await run('seo', ['auth', 'whoami'], 'Show the connected Google account.')

  heading('List accessible Analytics properties')
  cue(
    'The read-only scope calls the Google Analytics Admin API to list only the accounts and properties this signed-in user can access.',
  )
  await run(
    'seo',
    ['analytics', 'google', 'properties'],
    'Run property discovery.',
  )

  if (!options.skipSetup) {
    heading('Match a web stream during setup')
    cue(
      'Project setup reads web stream names and hostnames through the Analytics Admin API. It uses them to match the selected Search Console site to the correct Analytics property and saves that numeric property id locally.',
    )
    await run(
      'seo',
      [
        'start',
        '--id',
        options.project,
        '--name',
        'OAuth verification demo',
        '--site',
        options.site,
        '--url',
        options.url,
        '--skip-mcp',
        '--skip-skill',
        '--refresh',
      ],
      'Run setup. If several properties are shown, choose the one whose web stream matches the site.',
    )
  }

  await run(
    'seo',
    ['projects', 'show', '--id', options.project],
    'Show the locally saved Google Analytics property id.',
  )

  heading('Run the main report')
  cue(
    'The main report crawls the site and joins read-only Analytics landing-page sessions, users, and conversions to matching pages. Analytics is optional and a missing or partial source is kept separate from a zero.',
  )
  await run(
    'seo',
    [
      'report',
      '--project',
      options.project,
      '--days',
      '28',
      '--limit',
      '5',
      '--crawl-max-pages',
      '10',
      '--crawl-max-depth',
      '1',
      '--refresh',
    ],
    'Run the bounded main report.',
  )

  heading('Run a direct Analytics report')
  cue(
    'The Data API report reads landing pages with sessions, users, and conversions. The app does not create, edit, or delete any Analytics data.',
  )
  await run(
    'seo',
    [
      'analytics',
      'google',
      'report',
      '--property',
      options.property,
      '--start-date',
      '28daysAgo',
      '--end-date',
      'yesterday',
      '--dimensions',
      'landingPagePlusQueryString',
      '--metrics',
      'sessions,totalUsers,conversions',
      '--limit',
      '10',
      '--refresh',
    ],
    'Run the direct Data API report.',
  )

  heading('Find measured AI referrals')
  cue(
    'This feature reads session source, date, landing page, sessions, events, and total users. It reports only referral visits recorded by this Analytics property.',
  )
  await run(
    'seo',
    [
      'ai-referrals',
      '--property',
      options.property,
      '--start-date',
      '28daysAgo',
      '--end-date',
      'yesterday',
      '--result-limit',
      '10',
      '--refresh',
    ],
    'Run the AI referral report.',
  )

  heading('Use landing-page value to rank work')
  cue(
    'This workflow joins Analytics sessions, users, and conversions to Search Console opportunities. Complete Analytics evidence can help order the work. Partial evidence stays visible but cannot affect the score.',
  )
  await run(
    'seo',
    [
      'refresh-priorities',
      '--project',
      options.project,
      '--google-analytics-property',
      options.property,
      '--days',
      '28',
      '--limit',
      '5',
      '--no-verify-content',
      '--refresh',
    ],
    'Run the bounded priority workflow.',
  )

  heading('Measure a before and after change')
  cue(
    'The change report reads daily sessions, engaged sessions, conversions, and total revenue for equal before and after periods. It compares observed measurements and does not claim the SEO change caused them.',
  )
  await run(
    'seo',
    [
      'tests',
      'report',
      '--project',
      options.project,
      '--scope',
      'site',
      '--target',
      options.site,
      '--title',
      'OAuth verification demo',
      '--date',
      options.changeDate,
      '--property',
      options.property,
      '--before',
      '7',
      '--after',
      '7',
      '--refresh',
    ],
    'Run the before and after report.',
  )

  heading('State why the scope is the narrowest available')
  cue(
    'Google exposes analytics.readonly as the only read-only user OAuth scope for both these Admin API reads and Data API reports. The alternatives allow editing or management. SEO Skill requests no Analytics write, edit, user-management, provisioning, or deletion scope. Tokens and results stay local and can be removed with seo auth logout, seo cache clear with the google-analytics provider, or seo reset.',
  )
  await pause('Say the final scope explanation, then stop the recording.')
  process.stdout.write(
    `\nAfter recording, remove the temporary profile if you do not need it:\n$ seo projects delete --id ${shellQuote(options.project)}\n`,
  )
} finally {
  reader.close()
}
