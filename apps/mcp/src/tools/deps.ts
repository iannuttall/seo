import type { LinkedAccounts } from '@seo/core/commands'
import {
  type CommandDeps,
  checkPages,
  indexStatusFrom,
  liveCheck,
  mcpCall,
} from '@seo/core/commands'
import { accountUrl, signInHint } from '../google.ts'

// The core commands' functions for the hosted MCP: Search Console and Bing
// through the person's linked accounts, the shared live page checks, and
// calls written as MCP tool names.

// Bing blocks Cloudflare's network (ThrottleIP), so the hosted server has
// no Bing until its Bing calls go through a relay with its own address.
// The account store, Bing sign-in and routing stay ready for that.
export const HOSTED_BING = false

export function deps(env: Env, directory: LinkedAccounts): CommandDeps {
  return {
    searchAnalytics: directory.searchAnalytics(),
    checkPages,
    liveCheck,
    inspect: (site, url) => directory.inspect(site, url).then(indexStatusFrom),
    call: mcpCall,
    analytics: {
      accounts: async () => directory.accounts(),
      signIn: signInHint(env),
    },
    ...(HOSTED_BING
      ? {
          bing: async () => directory.bing,
          bingConnect: `Connect Bing at ${accountUrl(env)}.`,
        }
      : {}),
  }
}
