export function parseOlderThan(input?: string): number | undefined {
  if (!input) {
    return undefined
  }

  const match = input.trim().match(/^(\d+)([smhdw])$/i)
  if (!match) {
    throw new Error(
      `Invalid duration "${input}". Use values like 7d, 12h, 30m.`,
    )
  }

  const valuePart = match[1]
  const unitPart = match[2]
  if (!valuePart || !unitPart) {
    throw new Error(`Invalid duration "${input}".`)
  }

  const value = Number.parseInt(valuePart, 10)
  const unit = unitPart.toLowerCase()
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  }

  const multiplier = multipliers[unit]
  if (!multiplier) {
    throw new Error(`Unsupported duration unit in "${input}".`)
  }
  return value * multiplier
}

export function formatRelativeExpiry(expiresAt: number): string {
  const delta = expiresAt - Date.now()
  if (delta <= 0) {
    return 'expired'
  }

  const minutes = Math.round(delta / 60_000)
  if (minutes < 60) {
    return `in ${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return remMinutes ? `in ${hours}h ${remMinutes}m` : `in ${hours}h`
}

export function isoDate(daysAgo = 0): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}
