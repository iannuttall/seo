import {
  COMMANDS,
  type CommandId,
  telemetryReportFor,
} from '@seo/core/commands'
import { SEO_VERSION } from '@seo/core/hosted'
import type { ErrorCode } from './tools/registry.ts'

// Anonymous usage counts for the public stats page at seoskill.dev/stats,
// the same events the CLI sends: event, report id, agent, version and week.
// Never a site, URL, query, key, account or any report data. "hosted" in the
// os and arch fields tells hosted runs apart from CLI runs.

const ENDPOINT = 'https://seoskill.dev/api/t'

type Input = Record<string, unknown> | undefined

// The CLI report id each tool call counts as. Listing and raw-row calls are
// not reports, so they send nothing.
export function reportFor(tool: string, input: Input): string | null {
  const command = tool.replace(/^seo_/, '').replace('_', '-')
  if (!(command in COMMANDS)) return null
  const value = (key: string) =>
    typeof input?.[key] === 'string' ? (input[key] as string) : undefined
  return telemetryReportFor(command as CommandId, {
    section: value('section'),
    action: value('action'),
  })
}

export function agentFor(userAgent: string | null): string {
  const name = userAgent?.toLowerCase() ?? ''
  if (name.includes('claude')) return 'claude-code'
  if (name.includes('cursor')) return 'cursor'
  if (name.includes('codex') || name.includes('openai')) return 'codex'
  return 'unknown'
}

// ISO week, such as 2026-W42.
export function isoWeek(now: Date): string {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const FAILURES: Record<ErrorCode, [string, string]> = {
  INVALID_INPUT: ['config', 'invalid_input'],
  NOT_CONNECTED: ['auth', 'auth_required'],
  NO_ACCESS: ['auth', 'property_not_found'],
  NO_KEY: ['config', 'auth_config_required'],
  RATE_LIMITED: ['network', 'rate_limited'],
  GOOGLE_ERROR: ['network', 'provider_unavailable'],
  PROVIDER_ERROR: ['network', 'provider_unavailable'],
}

export function events(input: {
  tool: string
  args: Input
  userAgent: string | null
  failure: ErrorCode | 'INTERNAL' | null
  now?: Date
}): Record<string, string | number>[] {
  const report = reportFor(input.tool, input.args)
  if (!report) return []
  const base = {
    version: SEO_VERSION,
    agent: agentFor(input.userAgent),
    os: 'hosted',
    arch: 'hosted',
    node: '0',
    cohort: isoWeek(input.now ?? new Date()),
    schema: 2,
    report,
  }
  if (input.failure === null) {
    return [
      { event: 'audit_start', ...base },
      { event: 'audit_complete', ...base },
    ]
  }
  const [errorCategory, failureReason] =
    input.failure === 'INTERNAL'
      ? ['internal', 'internal_error']
      : FAILURES[input.failure]
  return [
    { event: 'audit_start', ...base },
    { event: 'audit_failed', ...base, errorCategory, failureReason },
  ]
}

export async function send(
  list: Record<string, string | number>[],
): Promise<void> {
  await Promise.all(
    list.map((body) =>
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      }).catch(() => undefined),
    ),
  )
}
