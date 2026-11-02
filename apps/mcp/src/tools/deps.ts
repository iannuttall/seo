import {
  type CommandDeps,
  CommandError,
  checkPages,
  indexStatusFrom,
  liveCheck,
  mcpCall,
} from '@seo/core/commands'
import { auditAccess } from '../audit/schedule.ts'
import { weekData } from '../audit/week.ts'
import { billingOn, startAuditSite } from '../billing.ts'
import { accountUrl, signInHint } from '../google.ts'
import { addUsage } from '../usage.ts'
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
  waitUntil,
}: Pick<
  ToolContext,
  'env' | 'userId' | 'directory' | 'beta' | 'waitUntil'
>): CommandDeps {
  const audit = beta.has('weekly-audit') ? auditAccess(env, userId) : null
  return {
    searchAnalytics: directory.searchAnalytics(),
    checkPages,
    liveCheck,
    // An audited site's URLs go through its store of results, so a fresh
    // one is never inspected again. A property with no checks left today
    // stops the run like Google's own quota does.
    inspect: async (site, url) => {
      const stored = audit ? await audit.inspect(site, url) : null
      if (!stored) {
        const raw = await directory.inspect(site, url)
        // The audited path counts its own checks in the site's object.
        waitUntil(
          addUsage(env, userId, { url_inspections: 1 }).catch(() => undefined),
        )
        return indexStatusFrom(raw)
      }
      if (stored.result === null) {
        throw new CommandError(
          'RATE_LIMITED',
          `This server has used today's URL Inspection quota for ${site}.`,
        )
      }
      return indexStatusFrom(stored.result)
    },
    call: mcpCall,
    analytics: {
      accounts: async () => directory.accounts(),
      signIn: signInHint(env),
    },
    ...(audit ? { audit, week: () => weekData(env, userId) } : {}),
    ...(audit || billingOn(env)
      ? { startAudit: (site) => startAuditSite(env, userId, site) }
      : {}),
    ...(HOSTED_BING
      ? {
          bing: async () => directory.bing,
          bingConnect: `Connect Bing at ${accountUrl(env)}.`,
        }
      : {}),
  }
}
