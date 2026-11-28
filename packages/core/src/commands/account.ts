// What seo_sites does to the account's plan, so an agent can do everything
// the account page's Plan tab does: pick or change a plan, buy a top-up,
// set auto-reload and cancel. The hosted server supplies the functions in
// CommandDeps; elsewhere these say to connect it.
import { z } from 'zod'
import {
  type ChoosePlan,
  type CommandDeps,
  CommandError,
  type CommandResult,
} from './types.js'

export const ACCOUNT_INPUTS = {
  plan: z
    .union([z.literal(10), z.literal(50), z.literal(100), z.literal(200)])
    .optional()
    .describe(
      'Optional. The usage plan to move to, in US dollars a month. Only after the person has said yes to that plan in this conversation: it charges their card.',
    ),
  top_up: z
    .union([z.literal(10), z.literal(25), z.literal(50)])
    .optional()
    .describe(
      "Optional. Buys a top-up of this many US dollars of usage, which never expires and is used after the plan's. Needs a plan. Only after the person has said yes: it charges their card.",
    ),
  auto_reload: z
    .object({
      amount: z
        .union([z.literal(10), z.literal(25), z.literal(50), z.null()])
        .describe('The top-up to buy when top-ups run low, or null for off.'),
      cap: z
        .number()
        .int()
        .min(10)
        .max(1000)
        .describe(
          'The most auto-reload may buy in a calendar month, in US dollars.',
        ),
    })
    .optional()
    .describe(
      'Optional. Turns auto-reload on or off. Only after the person has said yes to the amount and the monthly cap.',
    ),
  cancel: z
    .boolean()
    .optional()
    .describe(
      'Optional. true cancels the plan at the end of this period; false undoes that, so it renews. Only when the person asks.',
    ),
}

type AccountInput = {
  [K in keyof typeof ACCOUNT_INPUTS]?: z.infer<(typeof ACCOUNT_INPUTS)[K]>
} & { add?: string }

// Runs the plan action in input. Returns its result, or, when the plan is
// on and a site is to be added too, the text to put before that.
export async function runAccount(
  deps: CommandDeps,
  input: AccountInput,
): Promise<CommandResult | string> {
  const { topUp, autoReload, cancelPlan } = deps
  const hostedOnly = () =>
    new CommandError(
      'INVALID_INPUT',
      'Plans and usage change on the hosted server only. Connect https://seoskill.dev/mcp and call seo_sites there, or use https://seoskill.dev/account.',
    )
  if (input.top_up) {
    if (!topUp) throw hostedOnly()
    const result = await topUp(input.top_up)
    return {
      text:
        result.status === 'added'
          ? `Added a $${input.top_up} top-up, charged to the saved card. It never expires and is used after the plan's usage.`
          : `Stripe needs the person to confirm this one. Give them this link to pay for the $${input.top_up} top-up: ${result.url}`,
      data: result,
    }
  }
  if (input.auto_reload) {
    if (!autoReload) throw hostedOnly()
    const { amount, cap } = input.auto_reload
    if (amount !== null && cap < amount) {
      throw new CommandError(
        'INVALID_INPUT',
        `The monthly cap needs to be at least the $${amount} top-up.`,
      )
    }
    await autoReload(amount, cap)
    return {
      text:
        amount === null
          ? 'Auto-reload is off.'
          : `Auto-reload is on: a $${amount} top-up when top-ups run low, at most $${cap} a month, on the saved card.`,
      data: input.auto_reload,
    }
  }
  if (input.cancel !== undefined) {
    if (!cancelPlan) throw hostedOnly()
    const end = await cancelPlan(input.cancel)
    return {
      text: end
        ? `The plan is cancelled. It and its usage last until ${end.slice(0, 10)}, then nothing more is charged.`
        : 'The plan renews as normal.',
      data: { endsAt: end },
    }
  }
  if (input.plan) {
    const choose = deps.choosePlan
    if (!choose) {
      throw new CommandError(
        'INVALID_INPUT',
        'Plans change on the hosted server only. Connect https://seoskill.dev/mcp and call seo_sites with plan there, or pick a plan at https://seoskill.dev/account.',
      )
    }
    const result = await choose(input.plan)
    const texts: Record<ChoosePlan['status'], string> = {
      changed: `The account is on the $${input.plan} plan now. Stripe charged the saved card today, less what was left of the last plan, and this month's usage starts full.`,
      same: `The account is already on the $${input.plan} plan.`,
      scheduled:
        result.status === 'scheduled'
          ? `The account moves to the $${input.plan} plan on ${result.at.slice(0, 10)}. It keeps its current plan and usage until then.`
          : '',
      checkout:
        result.status === 'checkout'
          ? `The first plan needs a card. Give the person this Stripe Checkout link for the $${input.plan} plan: ${result.url}\nLater plan changes need no link: call seo_sites with plan again and the saved card is charged.`
          : '',
      pending:
        'The payment went through and the plan is starting. Call seo_sites in a minute to see it.',
      payment_failed:
        "Stripe couldn't take the payment, so the plan didn't change. The person can check their card under Manage billing at https://seoskill.dev/account.",
    }
    const onPlan = ['changed', 'same', 'scheduled'].includes(result.status)
    if (!input.add || !onPlan) {
      const then = input.add
        ? `\nOnce the plan is on, call seo_sites with add ${input.add} again.`
        : ''
      return { text: `${texts[result.status]}${then}`, data: result }
    }
    return `${texts[result.status]}\n\n`
  }
  return ''
}
