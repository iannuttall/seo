import {
  type CommandDeps,
  checkPages,
  indexStatusFrom,
  mcpCall,
} from '@seo/core/commands'
import { accountUrl, type Directory } from '../google.ts'

// The core commands' functions for the hosted MCP: Search Console and Bing
// through the person's linked accounts, the shared live page checks, and
// calls written as MCP tool names.

export function deps(env: Env, directory: Directory): CommandDeps {
  return {
    searchAnalytics: directory.searchAnalytics(),
    checkPages,
    inspect: (site, url) =>
      directory
        .inspect(site, url)
        .then(indexStatusFrom)
        .catch(() => null),
    call: mcpCall,
    bing: async () => directory.bing,
    bingConnect: `Connect Bing at ${accountUrl(env)}.`,
  }
}
