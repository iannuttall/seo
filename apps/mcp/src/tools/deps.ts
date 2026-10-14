import {
  type CommandDeps,
  type CommandId,
  indexStatusFrom,
  type SearchAnalyticsQuery,
} from '@seo/core/commands'
import { inspectUrl, MAX_ROWS, searchAnalytics } from '../google.ts'
import { pageFacts } from '../pages.ts'
import { ToolError } from './registry.ts'

// The core commands' functions for the hosted MCP: Search Console with the
// caller's Google token, live page checks with HTMLRewriter, and calls written
// as MCP tool names.

export function tool(command: CommandId): string {
  return `seo_${command.replace('-', '_')}`
}

export function deps(google: string): CommandDeps {
  const read: SearchAnalyticsQuery = async (site, body) => {
    const { maxRows, rowLimit, startRow: _startRow, ...query } = body
    const result = await searchAnalytics(
      google,
      site,
      { ...query, dimensions: query.dimensions ?? [] },
      maxRows ?? rowLimit ?? MAX_ROWS,
    )
    return {
      rows: result.rows,
      calls: result.calls,
      rowsFetched: result.rows.length,
    }
  }
  return {
    searchAnalytics: read,
    checkPages: pageFacts,
    inspect: (site, url) =>
      inspectUrl(google, site, url)
        .then(indexStatusFrom)
        .catch((error) =>
          error instanceof ToolError ? null : Promise.reject(error),
        ),
    call: (command, args) => {
      const shown = Object.entries(args ?? {}).filter(
        ([, value]) => value !== undefined,
      )
      return shown.length
        ? `${tool(command)} with ${shown.map(([key, value]) => `${key} ${typeof value === 'number' ? value : `"${value}"`}`).join(', ')}`
        : tool(command)
    },
  }
}
