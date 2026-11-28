import type { Usage } from '@seo/core/commands'
import {
  type Billing,
  changePlan,
  MAX_RELOAD_CAP,
  planCheckoutUrl,
  plansOn,
  setAutoReload,
  topUpCheckoutUrl,
} from './billing.ts'
import { creditCardCheckout, settleCredit } from './credit.ts'
import { directory } from './google.ts'
import { PLANS, TOP_UPS, usageOf } from './meter.ts'
import type { Account } from './store.ts'

// The account page's Plan tab (account.ts): the state it is drawn from, and
// its forms. Only while the usage plans are on (billing.ts plansOn).

export type PlanState = {
  // Monthly price and included usage, in US dollars.
  options: { price: number; included: number }[]
  current: number | null
  status: string | null
  // An active per-site plan, which a usage plan replaces at once.
  perSite: boolean
  usage: Usage
  topUps: number[]
  autoReload: { amount: number | null; cap: number | null; card: boolean }
  manage: boolean
}

// The Plan tab's state, or null while the usage plans are off. A free
// credit waiting for a site is decided first, best effort.
export async function planState(
  env: Env,
  userId: string,
  paid: Billing | null,
  accounts: Account[],
  keys: Record<string, string>,
): Promise<PlanState | null> {
  const plans = plansOn(env)
  if (!plans) return null
  await settleCredit(env, userId, directory(env, accounts)).catch((error) =>
    console.error('credit: settling failed', error),
  )
  const active = Boolean(paid?.active)
  return {
    options: [...plans.keys()]
      .sort((a, b) => a - b)
      .map((price) => ({ price, included: PLANS[price] })),
    current: active ? (paid?.plan ?? null) : null,
    status: active && paid?.plan != null ? paid.status : null,
    perSite: active && paid?.plan === null,
    usage: await usageOf(env, userId, Boolean(keys['x-dataforseo-login'])),
    topUps: [...TOP_UPS],
    autoReload: {
      amount: paid?.autoReload ?? null,
      cap: paid?.autoReloadCap ?? null,
      card: Boolean(paid?.paymentMethod),
    },
    manage: Boolean(paid?.customer),
  }
}

// "28 November", as the account page's messages say a date.
const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

export type PlanAction =
  // Open Stripe.
  | { url: string }
  // Show the Plan tab with this message.
  | { message: string; ok: boolean }
  // Not a Plan tab form, or not for this account: back to the account page.
  | null

// The Plan tab's forms: pick or change a plan, buy a top-up, set
// auto-reload, add a card for the free credit.
export async function planAction(
  env: Env,
  userId: string,
  path: string,
  field: (name: string) => string,
  paid: () => Promise<Billing | null>,
): Promise<PlanAction> {
  const plans = plansOn(env)
  if (!plans) return null
  const topUp = (usd: number) => (TOP_UPS as readonly number[]).includes(usd)
  switch (path) {
    // Pick a usage plan (Stripe Checkout) or change to another one.
    case '/account/plan': {
      const plan = Number(field('plan'))
      if (!plans.has(plan)) return null
      if (!(await paid())?.active) {
        const url = await planCheckoutUrl(env, userId, plan)
        return url
          ? { url }
          : {
              message:
                'Your payment went through and the plan is starting. Reload this page in a minute.',
              ok: true,
            }
      }
      const changed = await changePlan(env, userId, plan)
      return {
        message:
          changed.status === 'payment_failed'
            ? "Stripe couldn't take the payment, so your plan didn't change. Check your card in Manage billing."
            : changed.status === 'scheduled'
              ? `Your plan moves to $${plan} a month on ${longDate(changed.at)}. You keep this plan and its usage until then.`
              : changed.status === 'same'
                ? `You're on the $${plan} plan.`
                : `You're on the $${plan} plan now. Stripe charged it today, less what was left of your last plan, and your usage starts full.`,
        ok: changed.status !== 'payment_failed',
      }
    }
    case '/account/topup': {
      const usd = Number(field('usd'))
      if (!topUp(usd)) return null
      const row = await paid()
      if (!row?.active || row.plan === null) {
        return { message: 'Top-ups need a plan. Pick one first.', ok: false }
      }
      return { url: await topUpCheckoutUrl(env, userId, usd) }
    }
    case '/account/reload': {
      const row = await paid()
      if (!row?.active || row.plan === null) return null
      const amount = Number(field('amount'))
      const on = topUp(amount)
      const cap = Math.floor(Number(field('cap')))
      if (on && !(cap >= amount && cap <= MAX_RELOAD_CAP)) {
        return {
          message: `The monthly limit needs to be at least $${amount} and at most $${MAX_RELOAD_CAP}.`,
          ok: false,
        }
      }
      await setAutoReload(env, userId, on ? amount : null, cap)
      return {
        message: on
          ? `Auto-reload is on: $${amount} when your top-up runs low, up to $${cap} a month.`
          : 'Auto-reload is off.',
        ok: true,
      }
    }
    // Saves a card, with no charge, to unlock a free credit held for one.
    case '/account/credit/card': {
      const url = await creditCardCheckout(env, userId).catch((error) => {
        console.error('credit: card Checkout failed', error)
        return null
      })
      return url
        ? { url }
        : {
            message:
              "Couldn't open Stripe to add a card. Try again in a minute.",
            ok: false,
          }
    }
  }
  return null
}
