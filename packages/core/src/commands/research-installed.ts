import {
  dataForSeoMarket,
  eachKeyword,
  type ResearchDevice,
  type ResearchInput,
  type ResearchRows,
  serpDepth,
  serpKeywords,
} from './research-providers.js'
import { CommandError } from './types.js'

type Row = ResearchRows['rows'][number]

// One live results page from a provider package installed on this machine,
// through the package's serp-snapshot capability. Only the CLI and the local
// MCP server load packages, so only they supply this.
export type InstalledSerp = (input: {
  provider: string
  keyword: string
  country: string
  language: string
  device: ResearchDevice
  depth: number
}) => Promise<{
  rows: Row[]
  costMicros: number | null
  partial: boolean
  warnings: string[]
  // The depth read, when the package reads less than asked.
  depth: number
}>

// serp from an installed provider package, keyword by keyword like the
// built-in providers.
export async function installedSerpResearch(
  provider: string,
  input: ResearchInput,
  serp: InstalledSerp | undefined,
): Promise<ResearchRows> {
  if (!serp) {
    throw new CommandError(
      'INVALID_INPUT',
      `${provider} is not a built-in provider. Here the providers are dataforseo and ahrefs; installed provider packages run only in the seo CLI and the local MCP server (seo mcp serve).`,
    )
  }
  if (input.keywords.length === 0) {
    throw new CommandError('INVALID_INPUT', 'serp needs keywords.')
  }
  const keywords = input.keywords.slice(0, serpKeywords(input))
  const language = dataForSeoMarket(input.country, null).language_code
  const missed: string[] = []
  const warnings: string[] = []
  let costMicros: number | null = 0
  let partial = false
  let depth = serpDepth(input)
  const rows = await eachKeyword(keywords, missed, async (keyword) => {
    const got = await serp({
      provider,
      keyword,
      country: input.country,
      language,
      device: input.device ?? 'desktop',
      depth: serpDepth(input),
    })
    depth = Math.min(depth, got.depth)
    costMicros =
      costMicros === null || got.costMicros === null
        ? null
        : costMicros + got.costMicros
    partial ||= got.partial
    warnings.push(...got.warnings.map((warning) => `${keyword}: ${warning}`))
    return got.rows.map((row) => ({ keyword, ...row }))
  })
  // A keyword that did not fail and got no rows had an empty results page.
  const answered = new Set(rows.map((row) => row.keyword))
  if (depth < serpDepth(input)) {
    warnings.unshift(
      `The package reads at most ${depth} results a keyword, so this read ${depth} of the ${serpDepth(input)} asked for.`,
    )
  }
  return {
    rows,
    costUsd: costMicros === null ? null : Number((costMicros / 1e6).toFixed(6)),
    partial,
    missed,
    noData: keywords.filter(
      (keyword) => !missed.includes(keyword) && !answered.has(keyword),
    ),
    warnings,
  }
}
