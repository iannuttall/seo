import { headingLines } from './context.js'
import type { Caller } from './types.js'

// Autopilot: a scheduled run of the person's own agent, on its own
// scheduler and with its own access to the site's repository, that calls
// seo next, does the due jobs and opens a pull request for each change. The
// person's answer and rules live in the business context under
// "## Autopilot", so every run reads the same rules. seo next asks once
// while the heading is missing, and returns the setup steps and the run
// prompt when called with autopilot.

export type AutopilotState = 'not-set-up' | 'off' | 'on'

export function autopilotState(contextText: string): AutopilotState {
  const lines = headingLines(contextText, 'autopilot')
  if (!lines.length) return 'not-set-up'
  return /^off\b/i.test(lines[0] ?? '') ? 'off' : 'on'
}

// Shown under the due step until the person has answered.
export function autopilotAsk(site: string, call: Caller): string {
  return `Once this step's work is done, ask the person once whether to put ${site} on autopilot: you run on a schedule, daily or weekly, call this tool, do the due jobs and open a pull request for each change for them to review. If they say yes, run ${call('next', { site, autopilot: true })} for the setup steps. If they say no, add "## Autopilot" with the line "Off" to the business context and save it, so this is not asked again.`
}

// The prompt each scheduled run starts with.
export function autopilotRunPrompt(site: string, call: Caller): string {
  return [
    `Run SEO Skill's autopilot for ${site}.`,
    `1. Run ${call('next', { site })}. Settle the started jobs it lists first, as it says, then run it again.`,
    '2. Follow the due step for at most 5 of its jobs.',
    `3. Open one pull request for each change and name the job ids it covers in its description. Then run ${call('report', { site, mark: 'started', issues: '<ids>', note: '<pull request URL>' })}. Merge only what the "## Autopilot" rules in the business context allow. Everything else waits for review.`,
    `4. Where the step says to ask the person, such as before a new page, a template change, a redirect or a deletion, leave the question with its evidence where the person reviews your work, such as an issue in the repository, instead of making the change. Mark the job started with that link as note, so later runs do not ask again.`,
    '5. End with a short summary of what you opened and what waits for the person.',
  ].join('\n')
}

// The setup steps seo next returns with autopilot.
export function autopilotGuide(site: string, call: Caller): string {
  return [
    `Set up autopilot for ${site} with the person. Tell them each run uses their own model usage and does at most 5 jobs.`,
    [
      '1. Cadence. Weekly runs the whole loop and suits most sites. Daily also catches pages that drop out of Google or break within a day. Ask which they want.',
      "2. Where it runs. Use your own scheduler, or the platform you run on, to start a run with the prompt below at that cadence. Each run needs SEO Skill and push access to the site's repository, through the same connections you have now. A machine without a browser signs in to SEO Skill with an account token, as https://seoskill.dev/docs/cloud-agents explains. If you cannot run on a schedule, give the person the prompt to start from wherever they run you on a schedule.",
      '3. Rules. By default every change waits for the person to review its pull request. Ask whether any kind of change may merge on its own, such as titles and descriptions. New pages, template changes, redirects and deletions always wait for review.',
      `4. Save their answers in the business context under "## Autopilot": the cadence, where it runs, and what may merge on its own, or "Every change waits for review". Save it with ${call('next', { site, context: '<the whole context with the new heading>' })}.`,
    ].join('\n'),
    `The run prompt:\n\n${autopilotRunPrompt(site, call)}`,
    'Once it is set up, start one run now and show the person what it opened.',
  ].join('\n\n')
}
