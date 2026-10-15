import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSeoCliPaths } from '@seo/core'

// A one-time notice for people who used 0.2 and now run 0.3, in a terminal
// only. It is shown once, then a marker file in the config folder stops it.

const NOTICE = '0.3'

const TEXT = `SEO Skill 0.3: eight commands replace the 70+ old reports, and old report names print the command to use instead.
Free hosted MCP server, nothing to install: https://seoskill.dev/docs/mcp
To stay on the old version: npm i -g seo@0.2.41
What changed: https://github.com/iannuttall/seo/blob/main/CHANGELOG.md
`

export function showUpgradeNotice(argv: string[]): void {
  if (!process.stderr.isTTY || process.env.CI) return
  if (argv.includes('--json') || argv[0] === 'mcp') return
  try {
    const { configDir, configFile } = getSeoCliPaths()
    // Only people who used an older version have a config file already.
    if (!existsSync(configFile)) return
    const marker = join(configDir, 'notices.json')
    const seen = existsSync(marker)
      ? (JSON.parse(readFileSync(marker, 'utf8')) as string[])
      : []
    if (seen.includes(NOTICE)) return
    process.stderr.write(`\n${TEXT}\n`)
    writeFileSync(marker, JSON.stringify([...seen, NOTICE]), { mode: 0o600 })
  } catch {
    // A notice is never worth failing a command.
  }
}
