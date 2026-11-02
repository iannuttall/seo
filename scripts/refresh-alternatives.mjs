// Refreshes the facts a script can read in apps/web/src/content/alternatives:
// GitHub stars and the last commit on the default branch, with the date they
// were read. It also opens every source link and lists the ones that fail, so
// a person knows which pages to re-read. Prices, plans and features are never
// changed here, and neither is a file's `checked` date: a person moves that
// after re-reading the vendor's pages.
//
//   node scripts/refresh-alternatives.mjs
//
// It uses your gh login for GitHub when there is one, which avoids the
// anonymous rate limit.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIRECTORY = resolve(
  import.meta.dirname,
  '../apps/web/src/content/alternatives',
)
const TODAY = new Date().toISOString().slice(0, 10)
const token = (() => {
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
})()
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'seoskill-refresh-alternatives',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
}

async function github(path) {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new Error(`GitHub ${path} answered ${response.status}`)
  return JSON.parse(await response.text())
}

// npmjs.com refuses scripts, so an npm package page is checked on the registry.
const checkUrl = (url) =>
  url.replace(
    /^https:\/\/www\.npmjs\.com\/package\//,
    'https://registry.npmjs.org/',
  )

async function reachable(url) {
  try {
    const response = await fetch(checkUrl(url), {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (seoskill-refresh-alternatives)' },
      signal: AbortSignal.timeout(15_000),
    })
    await response.body?.cancel()
    return response.ok ? undefined : `answered ${response.status}`
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const files = readdirSync(DIRECTORY)
  .filter((file) => file.endsWith('.json'))
  .sort()
const failures = []

for (const file of files) {
  const path = resolve(DIRECTORY, file)
  const item = JSON.parse(readFileSync(path, 'utf8'))

  if (item.github) {
    // A refused request keeps the last numbers and their read date.
    try {
      const repo = await github(`repos/${item.github.repo}`)
      const [commit] = await github(
        `repos/${item.github.repo}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=1`,
      )
      item.github.stars = repo.stargazers_count
      item.github.lastCommit = commit.commit.committer.date.slice(0, 10)
      item.github.read = TODAY
    } catch (error) {
      failures.push(
        `${item.slug}: GitHub numbers not refreshed (${error.message})`,
      )
    }
  }

  for (const source of item.sources) {
    const problem = await reachable(source.url)
    if (problem)
      failures.push(`${item.slug}: ${source.fact} (${source.url}) ${problem}`)
  }

  writeFileSync(path, `${JSON.stringify(item, null, 2)}\n`, 'utf8')
  const age = Math.round(
    (Date.parse(TODAY) - Date.parse(item.checked)) / 86_400_000,
  )
  console.log(`${item.slug}: facts checked ${item.checked} (${age} days ago)`)
}

// Keep the files in the repo's formatting, so a refresh changes only numbers.
execFileSync('pnpm', ['exec', 'biome', 'format', '--write', DIRECTORY], {
  stdio: 'ignore',
})

if (failures.length) {
  console.log(`\nRe-read these sources:\n${failures.join('\n')}`)
  process.exitCode = 1
}
