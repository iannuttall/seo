// Ends the Markdown copy of every page with the setup prompt, so an agent
// reading any page can set up SEO Skill. The setup box itself is left out of
// the Markdown (its tabs and buttons mean nothing there), and many pages have
// no box at all. Runs after agentMarkdown has written the copies, and keeps
// agent-routes.json's size, token and hash for each copy in step. llms-full.txt
// is left as it is, so the prompt is not repeated once per page there.
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  type AgentRouteManifest,
  renderAgentRouteManifest,
  sha256,
} from '@iannuttall/seo-graph-core'
import type { AstroIntegration } from 'astro'
import { promptText, setupPrompts } from '../content/setup-prompts'

const setupMarkdown = (site: string): string => {
  const anyAgent = setupPrompts.find((client) => client.id === 'other')
  if (!anyAgent) throw new Error('Missing the "Any agent" setup prompt')
  const guides = setupPrompts
    .filter((client) => client.id !== 'other')
    .map((client) => `[${client.label}](${new URL(client.guide.href, site)})`)
  return [
    '## Set up SEO Skill',
    'Give this prompt to your AI agent. It installs the `seo` CLI, adds the hosted MCP server, waits while you sign in with Google and checks it connects.',
    `\`\`\`prompt\n${promptText(anyAgent)}\n\`\`\``,
    `There are setup guides for ${guides.join(', ')} and [every other agent](${new URL(anyAgent.guide.href, site)}).`,
  ].join('\n\n')
}

export const setupPromptMarkdown = (): AstroIntegration => {
  let site = ''
  return {
    name: 'seoskill-setup-markdown',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = config.site ?? ''
      },
      'astro:build:done': async ({ dir, logger }) => {
        const manifestFile = fileURLToPath(new URL('agent-routes.json', dir))
        const manifest = JSON.parse(
          await readFile(manifestFile, 'utf8'),
        ) as AgentRouteManifest
        const section = `\n${setupMarkdown(site)}\n`
        for (const page of manifest.pages) {
          const file = fileURLToPath(new URL(page.markdownFile, dir))
          await appendFile(file, section, 'utf8')
          const markdown = await readFile(file)
          page.bytes = markdown.byteLength
          page.tokens = Math.ceil(page.bytes / 4)
          page.sha256 = sha256(markdown)
        }
        await writeFile(
          manifestFile,
          renderAgentRouteManifest(manifest.site, manifest.pages),
          'utf8',
        )
        logger.info(
          `Added the setup prompt to ${manifest.pages.length} Markdown pages.`,
        )
      },
    },
  }
}
