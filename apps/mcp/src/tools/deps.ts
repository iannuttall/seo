import {
  type CommandDeps,
  CommandError,
  checkPages,
  indexStatusFrom,
  liveCheck,
  mcpCall,
} from '@seo/core/commands'
import { auditAccess, siteIssues } from '../audit/schedule.ts'
import { weekData } from '../audit/week.ts'
import {
  billingOf,
  billingOn,
  buyTopUp,
  choosePlan,
  plansOn,
  setAutoReload,
  setPlanCancel,
  startAuditSite,
} from '../billing.ts'
import { siteContext } from '../context.ts'
import { settleCredit } from '../credit.ts'
import { hostedFeedback } from '../feedback.ts'
import { accountUrl, signInHint } from '../google.ts'
import { includedOn, ownKey } from '../included.ts'
import { hostedSubmitAccess } from '../indexmysite.ts'
import { usageOf } from '../meter.ts'
import { clientNameOf } from '../oauth.ts'
import { siteProgress } from '../progress.ts'
import { updateLog } from '../update-log.ts'
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
  headers,
}: Pick<
  ToolContext,
  'env' | 'userId' | 'directory' | 'beta' | 'waitUntil' | 'headers'
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
    // Every account: audited sites keep the list here, others get it back
    // to save.
    issues: siteIssues(env, userId),
    context: siteContext(env, userId),
    siteProgress: siteProgress(env, userId),
    updateLog: updateLog(env, userId),
    submit: hostedSubmitAccess(env, userId),
    feedback: async (report) =>
      hostedFeedback(
        env,
        userId,
        (await clientNameOf(env, headers)) ?? headers.get('user-agent'),
        report,
      ),
    analytics: {
      accounts: async () => directory.accounts(),
      signIn: signInHint(env),
    },
    // What is left of the account's paid usage, once research can run on
    // it. Best effort: the free credit is settled first.
    ...(includedOn(env)
      ? {
          usage: async () => {
            await settleCredit(env, userId, directory).catch(() => undefined)
            return usageOf(env, userId, ownKey(headers))
          },
        }
      : {}),
    ...(audit
      ? {
          audit,
          week: () => weekData(env, userId),
        }
      : {}),
    ...(audit || billingOn(env) || plansOn(env)
      ? { startAudit: (site) => startAuditSite(env, userId, site) }
      : {}),
    ...(plansOn(env)
      ? {
          choosePlan: (plan) => choosePlan(env, userId, plan),
          topUp: (usd) => buyTopUp(env, userId, usd),
          // Auto-reload only buys top-ups on an active plan, so it's only
          // saved on one, as on the account page.
          autoReload: async (amount, cap) => {
            const paid = await billingOf(env, userId)
            if (!paid?.active || paid.plan === null) {
              throw new CommandError(
                'INVALID_INPUT',
                'Auto-reload needs a plan. Ask the person whether to pick one, then call seo_sites with plan.',
              )
            }
            await setAutoReload(env, userId, amount, cap)
          },
          cancelPlan: async (cancel) => {
            const end = await setPlanCancel(env, userId, cancel)
            return end === null ? null : new Date(end).toISOString()
          },
        }
      : {}),
    ...(HOSTED_BING
      ? {
          bing: async () => directory.bing,
          bingConnect: `Connect Bing at ${accountUrl(env)}.`,
        }
      : {}),
  }
}
