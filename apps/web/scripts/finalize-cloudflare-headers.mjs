import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'public/_headers')
const manifestPath = resolve(root, 'dist/agent-routes.json')
const outputPath = resolve(root, 'dist/_headers')

const source = (await readFile(sourcePath, 'utf8')).trimEnd()
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

if (manifest.version !== 1 || !Array.isArray(manifest.pages)) {
  throw new Error('Unsupported agent route manifest')
}

const tokenRules = [...manifest.pages]
  .sort((left, right) =>
    left.markdownPath.localeCompare(right.markdownPath, 'en-US'),
  )
  .map((page) => {
    if (
      typeof page.markdownPath !== 'string' ||
      !page.markdownPath.endsWith('.md') ||
      typeof page.canonical !== 'string' ||
      !page.canonical.startsWith('https://seoskill.dev') ||
      !Number.isSafeInteger(page.tokens) ||
      page.tokens < 0
    ) {
      throw new Error(
        `Invalid agent route manifest entry: ${page.markdownPath}`,
      )
    }
    return [
      page.markdownPath,
      '  ! Link',
      '  ! Vary',
      '  Content-Type: text/markdown; charset=utf-8',
      `  Link: <${page.canonical}>; rel="canonical"`,
      '  Link: <https://seoskill.dev/sitemap.xml>; rel="sitemap"; type="application/xml"',
      '  Link: <https://seoskill.dev/llms.txt>; rel="llms-txt"; type="text/markdown"',
      '  Link: <https://seoskill.dev/.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
      '  Vary: Accept',
      `  X-Markdown-Tokens: ${page.tokens}`,
    ].join('\n')
  })

await writeFile(
  outputPath,
  `${source}\n\n# Generated from agent-routes.json. Do not edit in dist.\n${tokenRules.join('\n\n')}\n`,
  'utf8',
)
