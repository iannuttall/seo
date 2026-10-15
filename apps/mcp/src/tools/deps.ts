import {
  type CommandDeps,
  checkPages,
  indexStatusFrom,
  mcpCall,
} from '@seo/core/commands'
import { inspectUrl, searchAnalyticsReader } from '../google.ts'

// The core commands' functions for the hosted MCP: Search Console with the
// caller's Google token, the shared live page checks, and calls written as MCP
// tool names.

export function deps(google: string): CommandDeps {
  return {
    searchAnalytics: searchAnalyticsReader(google),
    checkPages,
    inspect: (site, url) =>
      inspectUrl(google, site, url)
        .then(indexStatusFrom)
        .catch(() => null),
    call: mcpCall,
  }
}
