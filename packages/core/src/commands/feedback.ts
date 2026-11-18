import { z } from 'zod'
import type { SharedTool } from './tools.js'
import { CommandError, type CommandResult } from './types.js'

// seo feedback: a bug or idea about SEO Skill itself, with a proposed fix,
// sent to its maintainer. The agent sends it only after the person agrees.
// Every surface removes anything shaped like a key or token before it
// leaves; the hosted server does it again before forwarding.

export const FEEDBACK_SUMMARY_MAX = 120
export const FEEDBACK_DETAILS_MAX = 4_000
export const FEEDBACK_TOOL_MAX = 40

export type FeedbackReport = {
  summary: string
  details: string
  tool?: string
}

// Where a report goes on this surface: the hosted server forwards it, the
// CLI and the local MCP post it to the hosted server.
export type FeedbackSend = (report: FeedbackReport) => Promise<void>

const REDACTED = '[removed]'

// Shapes of keys and tokens: Google OAuth tokens, common API key prefixes,
// bearer and basic headers, JWTs, labelled secrets, long hex, and long
// runs that mix upper case, lower case and digits like random keys do.
// URLs and slugs are left alone. A false positive costs a word in a
// report, which is cheaper than a leaked key.
const SECRET_PATTERNS: RegExp[] = [
  /\bya29\.[\w.-]+/g,
  /\b1\/\/[\w-]{20,}/g,
  /\b(?:sk|pk|rk|whsec|ghp|gho|ghs|ghu|github_pat|xox[abpr])[_-][\w-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[\w-]{30,}/g,
  /\b(?:bearer|basic)\s+[\w.~+/=-]{8,}/gi,
  /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g,
  /\b[a-f0-9]{32,}\b/gi,
]
const LABELLED =
  /\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|sitekey|authorization)\s*[:=]\s*["']?)[^\s"',;]{6,}/gi
const RANDOM_RUN = /[A-Za-z0-9+_-]{24,}={0,2}/g
const looksRandom = (run: string) =>
  /[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run)

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (out, pattern) => out.replace(pattern, REDACTED),
    text,
  )
    .replace(LABELLED, (_, label: string) => `${label}${REDACTED}`)
    .replace(RANDOM_RUN, (run) => (looksRandom(run) ? REDACTED : run))
}

// Checks the limits and removes secrets. Throws on input no surface sends.
export function cleanFeedback(input: FeedbackInput): FeedbackReport {
  const summary =
    typeof input.summary === 'string'
      ? input.summary.replace(/\s+/g, ' ').trim()
      : ''
  const details = typeof input.details === 'string' ? input.details.trim() : ''
  const tool =
    typeof input.tool === 'string' && input.tool.trim()
      ? input.tool.trim()
      : undefined
  if (!summary || summary.length > FEEDBACK_SUMMARY_MAX) {
    throw new CommandError(
      'INVALID_INPUT',
      `summary is 1 to ${FEEDBACK_SUMMARY_MAX} characters.`,
    )
  }
  if (!details || details.length > FEEDBACK_DETAILS_MAX) {
    throw new CommandError(
      'INVALID_INPUT',
      `details is 1 to ${FEEDBACK_DETAILS_MAX.toLocaleString('en-US')} characters.`,
    )
  }
  if (tool && !/^[\w -]{1,40}$/.test(tool)) {
    throw new CommandError(
      'INVALID_INPUT',
      'tool is a tool or command name, such as seo_report.',
    )
  }
  return {
    summary: redactSecrets(summary),
    details: redactSecrets(details),
    ...(tool ? { tool } : {}),
  }
}

type FeedbackInput = { summary?: unknown; details?: unknown; tool?: unknown }

export async function runFeedback(
  input: FeedbackInput,
  send: FeedbackSend | undefined,
): Promise<CommandResult> {
  if (!send) {
    throw new CommandError(
      'INVALID_INPUT',
      'Feedback cannot be sent from here. Open an issue at https://github.com/iannuttall/seo/issues instead.',
    )
  }
  const report = cleanFeedback(input)
  await send(report)
  return {
    text: 'Sent to the maintainer of SEO Skill. Thank the person; nothing else to do.',
    data: { sent: true, ...report },
  }
}

// The shared seo_feedback tool, listed in SHARED_TOOLS.
export const FEEDBACK_TOOL: SharedTool = {
  name: 'seo_feedback',
  command: 'feedback',
  title: 'Send feedback',
  description:
    "Sends a bug or idea about SEO Skill itself to its maintainer, with your proposed fix. Show the person the text first and send only if they agree; leave out keys, tokens and site data they didn't agree to share. Hosted and linked accounts send the account email.",
  input: z.object({
    summary: z
      .string()
      .min(1)
      .max(FEEDBACK_SUMMARY_MAX)
      .describe('One line: what is wrong or missing.'),
    details: z
      .string()
      .min(1)
      .max(FEEDBACK_DETAILS_MAX)
      .describe(
        'What you called, what happened, what you expected, and the fix you propose.',
      ),
    tool: z
      .string()
      .max(FEEDBACK_TOOL_MAX)
      .optional()
      .describe('Optional. The tool or command it is about.'),
  }),
  writes: true,
  run: (surface, input) =>
    runFeedback(input as FeedbackInput, surface.deps.feedback),
}
