// Paid usage on the hosted server: what a person has left of their plan's
// included usage, their top-ups and their one-off free credit, and the
// notices paid calls add. Only DataForSEO calls on SEO Skill's own account
// use it; everything else is free. People see a share left and a reset
// date, never what the data costs us.

export type Usage = {
  // The monthly plan in US dollars (10, 50, 100 or 200), or null without one.
  plan: number | null
  // Share of the plan's included usage left this period, 0 to 100, or null
  // without a plan.
  percentLeft: number | null
  // When the plan's usage resets, as an ISO date, or null without a plan.
  resetsAt: string | null
  // Top-up balance in US dollars. Used after the plan's usage.
  topUpUsd: number
  // Share of the one-off free credit left, 0 to 100, or null when the
  // account has none.
  creditPercentLeft: number | null
  // Why the free credit is waiting, when it is: unlock with a card, or the
  // account has no site that qualifies yet.
  creditHeld: 'card' | 'site' | null
  // DataForSEO calls run on the person's own key, so they use none of this.
  ownKey: boolean
  // True when nothing paid is left: no plan usage, top-up or credit.
  empty: boolean
  // Where to top up, upgrade or add a key.
  accountUrl: string
}

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

const usd = (value: number) => `$${value.toFixed(2)}`

// One line for seo_sites: the plan, what is left and what DataForSEO calls
// run on.
export function usageLine(usage: Usage | null): string {
  if (!usage) {
    return "Usage: unknown. The usage of this account couldn't be read."
  }
  const parts: string[] = []
  if (usage.plan !== null && usage.percentLeft !== null) {
    parts.push(
      `Plan $${usage.plan}: ${usage.percentLeft}% of usage left${usage.resetsAt ? `, resets ${date(usage.resetsAt)}` : ''}.`,
    )
  } else {
    parts.push('No plan.')
  }
  if (usage.topUpUsd > 0) parts.push(`Top-up ${usd(usage.topUpUsd)}.`)
  if (usage.creditPercentLeft !== null) {
    parts.push(`Free credit: ${usage.creditPercentLeft}% left.`)
  } else if (usage.creditHeld === 'card') {
    parts.push(
      `Free credit waiting: add a card at ${usage.accountUrl} to unlock it (no charge).`,
    )
  } else if (usage.creditHeld === 'site') {
    parts.push(
      'Free credit waiting: it unlocks once a Search Console site on its own domain with search impressions is connected.',
    )
  }
  parts.push(
    usage.ownKey
      ? 'DataForSEO: your own key, so research uses none of this.'
      : 'DataForSEO: included usage.',
  )
  return `Usage: ${parts.join(' ')}`
}

// The next steps when usage runs low or out.
export function usageNextSteps(usage: Usage): string {
  const reset =
    usage.resetsAt && usage.plan !== null
      ? `, or wait for the reset on ${date(usage.resetsAt)}`
      : ''
  if (usage.plan === null) {
    return `Next: ask the person whether to pick the $${PLAN_PRICES[0]} plan, with unlimited sites, the weekly site audit and research usage each month. If they say yes, call seo_sites with plan ${PLAN_PRICES[0]} and give them the Stripe link it returns. Or they can add their own DataForSEO key at ${usage.accountUrl}.`
  }
  const next = PLAN_PRICES.find((price) => price > (usage.plan ?? 0))
  return next
    ? `Next: ask the person whether to move to the $${next} plan, with ${next / usage.plan}× the usage. If they say yes, call seo_sites with plan ${next}: it's charged to their saved card at once and the usage starts full. Or they can top up or add their own DataForSEO key at ${usage.accountUrl}${reset}.`
    : `Next: the person can top up or add their own DataForSEO key at ${usage.accountUrl}${reset}.`
}

// The usage plans' monthly prices in US dollars, lowest first.
export const PLAN_PRICES = [10, 50, 100, 200] as const

export const USAGE_THRESHOLDS = [50, 80, 100] as const

// The highest threshold of used share that usage has reached, or 0.
export function usedThreshold(usage: Usage): number {
  if (usage.empty) return 100
  if (usage.plan === null || usage.percentLeft === null) {
    if (usage.creditPercentLeft === null) return 0
    const used = 100 - usage.creditPercentLeft
    return [...USAGE_THRESHOLDS].reverse().find((t) => used >= t) ?? 0
  }
  // Top-ups extend the plan, so the plan's share only counts while none
  // are left.
  if (usage.topUpUsd > 0) return 0
  const used = 100 - usage.percentLeft
  return [...USAGE_THRESHOLDS].reverse().find((t) => used >= t) ?? 0
}

// The notice a paid call adds the first time usage passes a threshold.
export function usageNotice(usage: Usage, threshold: number): string {
  const what = usage.plan === null ? 'free credit' : "this month's usage"
  const reset =
    usage.plan !== null && usage.resetsAt
      ? ` (resets ${date(usage.resetsAt)})`
      : ''
  if (threshold >= 100) {
    return `You've used all of ${what}${reset}. Research on SEO Skill's DataForSEO account stops until there's more; free tools keep working. ${usageNextSteps(usage)}`
  }
  return `You've used ${threshold}% of ${what}${reset}. ${usageNextSteps(usage)}`
}

// The USAGE_LIMIT message: nothing paid is left.
export function usageLimitMessage(usage: Usage): string {
  return `No usage left for research on SEO Skill's DataForSEO account. Search Console, Google Analytics, index checks and the other free tools still work. ${usageNextSteps(usage)}`
}

// The header the hosted server adds to the provider keys when research runs
// on SEO Skill's own DataForSEO account, on the account's paid usage.
// Results then leave out what DataForSEO charged: people see their share of
// usage left, never what the data costs SEO Skill.
export const INCLUDED_HEADER = 'x-seo-included'

export const onIncludedUsage = (keys: Headers): boolean =>
  keys.get(INCLUDED_HEADER) === '1'

// What research results say instead of a DataForSEO cost on included usage.
export const INCLUDED_NOTE =
  "Ran on SEO Skill's DataForSEO account and used some of this account's usage; seo_sites shows what's left."
