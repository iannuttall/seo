import {
  CommandError,
  type CommandResult,
  INCLUDED_HEADER,
  usageLimitMessage,
} from '@seo/core/commands'
import { autoReload } from './billing.ts'
import { settleCredit } from './credit.ts'
import { charge, spendable, usageOf } from './meter.ts'
import type { ToolContext } from './tools/registry.ts'
import { addUsage } from './usage.ts'

// Research on SEO Skill's own DataForSEO account, metered against the
// account's paid usage (meter.ts). It is on once the usage plans have
// prices and the server has a DataForSEO login; until then research needs
// the person's own key, as before.

export function includedOn(env: Env): boolean {
  return Boolean(
    env.STRIPE_PLAN_PRICES?.trim() &&
      env.DATAFORSEO_LOGIN &&
      env.DATAFORSEO_PASSWORD,
  )
}

// The person saved a DataForSEO key, or sent one with the request.
export const ownKey = (headers: Headers): boolean =>
  Boolean(headers.get('x-dataforseo-login'))

// Actions that run on DataForSEO whatever keys are saved.
const DATAFORSEO_ONLY = new Set(['ai_answers', 'mentions', 'index_check'])

// Whether a seo_research call would run on DataForSEO: asked for, or
// without a provider when no Ahrefs key would take it.
export function usesDataForSeo(input: unknown, headers: Headers): boolean {
  const { provider, action, pages } = (input ?? {}) as {
    provider?: unknown
    action?: unknown
    pages?: unknown
  }
  if (provider !== undefined) return provider === 'dataforseo'
  if (!headers.get('x-ahrefs-key')) return true
  return (
    DATAFORSEO_ONLY.has(String(action)) ||
    (pages === true && (action === 'backlinks' || action === 'link_gap'))
  )
}

// Settles the free credit once per request, before usage is read.
const settled = new WeakMap<ToolContext, Promise<void>>()
export function settle(context: ToolContext): Promise<void> {
  let done = settled.get(context)
  if (!done) {
    done = settleCredit(context.env, context.userId, context.directory).catch(
      () => undefined,
    )
    settled.set(context, done)
  }
  return done
}

// What a result or an error says DataForSEO charged, in US dollars.
const costOf = (value: unknown): number => {
  const cost = (value as { costUsd?: unknown; cost?: unknown } | null) ?? {}
  const usd = typeof cost.costUsd === 'number' ? cost.costUsd : cost.cost
  return typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? usd : 0
}

// Charges what a call spent, and records SEO Skill's cost.
async function spend(context: ToolContext, costUsd: number) {
  const { env, userId } = context
  const result = await charge(env, userId, costUsd)
  context.waitUntil(
    addUsage(env, userId, {
      included_research_microusd: Math.round(costUsd * 1_000_000),
    }).catch(() => undefined),
  )
  if (result.reload) {
    context.waitUntil(autoReload(env, userId).catch(() => undefined))
  }
  return result
}

// Runs a research call on SEO Skill's DataForSEO account when this is
// included usage, or as it is otherwise. Included usage stops with
// USAGE_LIMIT when nothing paid is left, charges what DataForSEO says the
// call cost (on a thrown error too, when it carries a cost) and adds the
// usage notice the first time usage passes 50, 80 or 100%.
export async function runResearch(
  context: ToolContext,
  input: unknown,
  run: (keys: Headers) => Promise<CommandResult>,
): Promise<{ result: CommandResult; included: boolean }> {
  const { env, headers } = context
  if (!includedOn(env) || ownKey(headers) || !usesDataForSeo(input, headers)) {
    return { result: await run(headers), included: false }
  }
  await settle(context)
  if ((await spendable(env, context.userId)) <= 0) {
    const usage = await usageOf(env, context.userId, false)
    throw new CommandError('USAGE_LIMIT', usageLimitMessage(usage))
  }
  const keys = new Headers(headers)
  keys.set('x-dataforseo-login', env.DATAFORSEO_LOGIN)
  keys.set('x-dataforseo-password', env.DATAFORSEO_PASSWORD)
  keys.set(INCLUDED_HEADER, '1')
  let result: CommandResult
  try {
    result = await run(keys)
  } catch (error) {
    const lost = costOf(error)
    if (lost) {
      await spend(context, lost).catch((failed: unknown) =>
        console.error('included research charge', failed),
      )
    }
    throw error
  }
  const costUsd = costOf(result.data)
  if (!costUsd) return { result, included: true }
  // The data is fetched and paid for, so a failed charge still returns it.
  const notice = await spend(context, costUsd).then(
    (charged) => charged.notice,
    (error: unknown) => {
      console.error('included research charge', error)
      return null
    },
  )
  return {
    result: notice
      ? { ...result, text: `${result.text}\n\n${notice}` }
      : result,
    included: true,
  }
}
