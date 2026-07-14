import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroConfig, AstroIntegration } from 'astro'
import {
  canonicalFromHtml,
  injectMarkdownAlternate,
  isNoindexHtml,
  isRedirectHtml,
} from './html.js'
import { type LlmsTxtConfig, renderLlmsTxt } from './llms.js'
import {
  type AgentRouteManifest,
  type AgentRouteManifestEntry,
  renderAgentRouteManifest,
  sha256,
} from './manifest.js'
import { renderAgentMarkdown } from './render.js'
import { assertNoRouteCollisions, markdownRouteForPath } from './routes.js'

export interface AgentMarkdownIntegrationOptions {
  excludeSelectors?: readonly string[]
  manifestFile?: string
  llmsTxt?: LlmsTxtConfig
  strict?: boolean
}

type BuildConfig = Pick<AstroConfig, 'base' | 'build' | 'output' | 'site'>

async function walkHtmlFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en-US'))
    for (const entry of entries) {
      const path = resolve(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && entry.name.endsWith('.html')) files.push(path)
    }
  }
  await walk(directory)
  return files
}

function outputRelativePath(outputDir: string, file: string): string {
  return relative(outputDir, file).split(sep).join('/')
}

function isStatusPage(file: string): boolean {
  return /(?:^|\/)(?:404|500)(?:\/index)?\.html$/u.test(file)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function assertCanonicalSite(canonical: URL, site: URL): void {
  if (canonical.origin !== site.origin) {
    throw new Error(`Canonical ${canonical} is outside configured site ${site}`)
  }
}

export async function writeAgentMarkdownArtifacts(input: {
  base?: string
  excludeSelectors?: readonly string[]
  manifestFile?: string
  llmsTxt?: LlmsTxtConfig
  outputDir: string
  site: string
}): Promise<AgentRouteManifestEntry[]> {
  const outputDir = resolve(input.outputDir)
  const site = new URL(input.site)
  const prepared: Array<{
    entry: AgentRouteManifestEntry
    html: string
    htmlFile: string
    markdown: string
    markdownFile: string
  }> = []

  for (const htmlFile of await walkHtmlFiles(outputDir)) {
    const relativeHtmlFile = outputRelativePath(outputDir, htmlFile)
    if (isStatusPage(relativeHtmlFile)) continue

    const html = await readFile(htmlFile, 'utf8')
    if (isRedirectHtml(html)) continue
    const canonicalValue = canonicalFromHtml(html)
    if (!canonicalValue) {
      throw new Error(`Missing canonical in ${relativeHtmlFile}`)
    }
    const canonical = new URL(canonicalValue, site)
    assertCanonicalSite(canonical, site)
    const route = markdownRouteForPath(canonical.pathname, input.base)
    const markdownFile = resolve(outputDir, route.filePath)
    if (!markdownFile.startsWith(`${outputDir}${sep}`)) {
      throw new Error(`Markdown target escapes output: ${route.filePath}`)
    }

    const rendered = renderAgentMarkdown(html, canonical.toString(), {
      excludeSelectors: input.excludeSelectors,
    })
    const absoluteMarkdownUrl = new URL(route.markdownPath, site).toString()
    const injectedHtml = injectMarkdownAlternate(html, absoluteMarkdownUrl)
    const bytes = Buffer.byteLength(rendered.markdown)
    prepared.push({
      entry: {
        bytes,
        canonical: canonical.toString(),
        description: rendered.metadata.description,
        htmlFile: relativeHtmlFile,
        htmlPath: route.htmlPath,
        language: rendered.metadata.language,
        markdownFile: outputRelativePath(outputDir, markdownFile),
        markdownPath: route.markdownPath,
        noindex: isNoindexHtml(html),
        sha256: sha256(rendered.markdown),
        title: rendered.metadata.title,
        tokens: rendered.tokenEstimate,
      },
      html: injectedHtml,
      htmlFile,
      markdown: rendered.markdown,
      markdownFile,
    })
  }

  assertNoRouteCollisions(
    prepared.map((item) =>
      markdownRouteForPath(item.entry.htmlPath, input.base),
    ),
  )
  prepared.sort((left, right) =>
    left.entry.htmlPath.localeCompare(right.entry.htmlPath, 'en-US'),
  )

  for (const item of prepared) {
    if (await exists(item.markdownFile)) {
      const existing = await readFile(item.markdownFile, 'utf8')
      if (existing !== item.markdown) {
        throw new Error(
          `Refusing to overwrite existing Markdown: ${item.entry.markdownFile}`,
        )
      }
    }
  }

  for (const item of prepared) {
    await mkdir(dirname(item.markdownFile), { recursive: true })
    await writeFile(item.markdownFile, item.markdown, 'utf8')
    await writeFile(item.htmlFile, item.html, 'utf8')
  }

  const manifestPath = resolve(
    outputDir,
    input.manifestFile ?? 'agent-routes.json',
  )
  const manifest: AgentRouteManifest = {
    version: 1,
    site: site.origin,
    pages: prepared.map((item) => item.entry),
  }
  await writeFile(
    manifestPath,
    renderAgentRouteManifest(site.origin, manifest.pages),
    'utf8',
  )
  if (input.llmsTxt) {
    await writeFile(
      resolve(outputDir, 'llms.txt'),
      renderLlmsTxt(manifest, input.llmsTxt),
      'utf8',
    )
  }

  return prepared.map((item) => item.entry)
}

export function agentMarkdown(
  options: AgentMarkdownIntegrationOptions = {},
): AstroIntegration {
  const strict = options.strict !== false
  let config: BuildConfig | undefined

  return {
    name: '@seo/astro',
    hooks: {
      'astro:config:done': ({ config: resolvedConfig }) => {
        if (strict && resolvedConfig.output !== 'static') {
          throw new Error('@seo/astro currently requires static output')
        }
        if (strict && !resolvedConfig.site) {
          throw new Error('@seo/astro requires a configured site URL')
        }
        config = resolvedConfig
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (!config?.site) {
          if (strict) throw new Error('@seo/astro did not receive a site URL')
          return
        }
        const pages = await writeAgentMarkdownArtifacts({
          base: config.base,
          excludeSelectors: options.excludeSelectors,
          manifestFile: options.manifestFile,
          llmsTxt: options.llmsTxt,
          outputDir: fileURLToPath(dir),
          site: config.site.toString(),
        })
        logger.info(`Generated ${pages.length} Markdown alternatives.`)
      },
    },
  }
}
