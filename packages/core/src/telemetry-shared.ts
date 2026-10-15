// The parts of anonymous usage counting that the CLI, the local MCP and the
// hosted MCP share. No Node built-ins, so the hosted Worker can use them.

export const TELEMETRY_ENDPOINT = 'https://seoskill.dev/api/t'
export const TELEMETRY_SCHEMA_VERSION = 2

// ISO week, such as 2026-W42.
export function isoWeek(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// The agent named by an MCP client name or user agent, or null when the
// name is empty.
export function agentFromClientName(
  name: string | null | undefined,
): 'claude-code' | 'cursor' | 'codex' | 'unknown' | null {
  const value = name?.toLowerCase() ?? ''
  if (!value) return null
  if (value.includes('claude')) return 'claude-code'
  if (value.includes('cursor')) return 'cursor'
  if (value.includes('codex') || value.includes('openai')) return 'codex'
  return 'unknown'
}
