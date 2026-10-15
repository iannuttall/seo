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

// Bing blocks Cloudflare's network (ThrottleIP), so the hosted server has
// no Bing until its Bing calls go through a relay with its own address.
// The account store, Bing sign-in and routing stay ready for that.
export const HOSTED_BING = false

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
    ...(HOSTED_BING
      ? {
          bing: async () => directory.bing,
          bingConnect: `Connect Bing at ${accountUrl(env)}.`,
        }
      : {}),
  }
}
