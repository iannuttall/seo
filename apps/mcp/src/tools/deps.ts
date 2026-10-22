import {
  type CommandDeps,
  checkPages,
  indexStatusFrom,
  liveCheck,
  mcpCall,
} from '@seo/core/commands'
import { auditSnapshot } from '../audit/schedule.ts'
import { accountUrl, signInHint } from '../google.ts'
import type { ToolContext } from './registry.ts'

// The core commands' functions for the hosted MCP: Search Console and Bing
// through the person's linked accounts, the shared live page checks, and
// calls written as MCP tool names.

// Bing blocks Cloudflare's network (ThrottleIP), so the hosted server has
// no Bing until its Bing calls go through a relay with its own address.
// The account store, Bing sign-in and routing stay ready for that.
export const HOSTED_BING = false

export function deps({
  env,
  userId,
  directory,
  beta,
}: Pick<ToolContext, 'env' | 'userId' | 'directory' | 'beta'>): CommandDeps {
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
    ...(beta.has('weekly-audit')
      ? { audit: (site: string) => auditSnapshot(env, userId, site) }
      : {}),
    ...(HOSTED_BING
      ? {
          bing: async () => directory.bing,
          bingConnect: `Connect Bing at ${accountUrl(env)}.`,
        }
      : {}),
  }
}
