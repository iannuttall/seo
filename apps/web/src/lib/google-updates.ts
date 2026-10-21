// Google ranking updates in the words and dates the update checker shows.
// Dates are on the Pacific calendar, like Search Console and Google's posts.

import type { SearchUpdate } from '@seo/core/updates/browser'
import type { TimelineUpdate } from '@/lib/update-timeline'

export type DescribedUpdate = TimelineUpdate & {
  year: string
  started: string
  finished: string
  rollout: string
  url: string
}

const HOUR = 3_600_000

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
}

// "13 days, 16 hours", the way Google's history page counts a rollout.
export function rollout(start: string, end?: string): string {
  if (!end) return 'Rolling out'
  const hours = Math.round((Date.parse(end) - Date.parse(start)) / HOUR)
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  const parts = [
    days ? `${days} ${days === 1 ? 'day' : 'days'}` : '',
    rest ? `${rest} ${rest === 1 ? 'hour' : 'hours'}` : '',
  ].filter(Boolean)
  return parts.join(', ') || 'Under an hour'
}

// The line over the chart. The page renders it from the saved dates, then
// again after reading Google's feed; both say the same unless Google posted
// something new, so the chart does not move.
export function rolloutStatus(updates: DescribedUpdate[], now: number): string {
  const rolling = updates.filter((update) => !update.end)
  if (rolling.length) {
    return `Rolling out now: ${rolling
      .map(
        (update) =>
          `${update.name}, started ${update.started} (day ${Math.max(1, Math.ceil((now - Date.parse(update.start)) / (24 * HOUR)))})`,
      )
      .join('; ')}.`
  }
  const latest = updates[0]
  return latest
    ? `No update is rolling out. The latest, the ${latest.name}, finished on ${latest.finished}.`
    : 'No update is rolling out.'
}

function kind(type: SearchUpdate['type']): TimelineUpdate['kind'] {
  return type === 'core' || type === 'spam' ? type : 'other'
}

export function describeUpdates(updates: SearchUpdate[]): DescribedUpdate[] {
  return updates.map((update) => ({
    id: update.id,
    name: update.name,
    kind: kind(update.type),
    start: update.start,
    ...(update.end ? { end: update.end } : {}),
    year: new Date(update.start).toLocaleDateString('en-GB', {
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    }),
    started: formatDay(update.start),
    finished: update.end ? formatDay(update.end) : 'Rolling out',
    rollout: rollout(update.start, update.end),
    url: update.sourceUrl,
  }))
}
