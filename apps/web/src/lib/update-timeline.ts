// Draws the Google update timeline as an SVG string: one band per update,
// a coloured mark in its type's lane, and optionally a person's daily
// Search Console line on top. Pure, so the page can redraw it on resize.

export type TimelineUpdate = {
  id: string
  name: string
  kind: 'core' | 'spam' | 'other'
  start: string
  end?: string
}

export type TimelineDay = { date: string; value: number }

export type TimelineInput = {
  width: number
  from: number
  to: number
  updates: TimelineUpdate[]
  days?: TimelineDay[]
  metric?: string
  changeDate?: string | null
  now: number
}

export const KIND_COLOURS: Record<TimelineUpdate['kind'], string> = {
  core: 'var(--primary)',
  spam: 'var(--warning)',
  other: 'var(--foreground-soft)',
}

const LANES: TimelineUpdate['kind'][] = ['core', 'spam', 'other']
const LANE = 7
const LANE_GAP = 3
const TOP = LANES.length * (LANE + LANE_GAP) + 6
const AXIS = 24
const LEFT_WITH_DATA = 44
const DAY = 86_400_000

export function timelineHeight(withData: boolean): number {
  return withData ? 280 : 200
}

export function layout(input: TimelineInput) {
  const left = input.days?.length ? LEFT_WITH_DATA : 8
  const right = 8
  const height = timelineHeight(Boolean(input.days?.length))
  const span = Math.max(DAY, input.to - input.from)
  const x = (time: number) =>
    left + ((time - input.from) / span) * (input.width - left - right)
  const time = (pixel: number) =>
    input.from + ((pixel - left) / (input.width - left - right)) * span
  return { left, right, height, x, time, plotBottom: height - AXIS }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) =>
    character === '&'
      ? '&amp;'
      : character === '<'
        ? '&lt;'
        : character === '>'
          ? '&gt;'
          : '&quot;',
  )

export function dayTime(date: string): number {
  return Date.parse(`${date}T12:00:00Z`)
}

// Monthly ticks, spaced so labels never touch: each label gets about 72px,
// which fits "Nov 2025".
function ticks(
  from: number,
  to: number,
  width: number,
): { time: number; label: string }[] {
  const months = (to - from) / (30 * DAY)
  const step =
    [1, 2, 3, 6, 12].find((each) => (months / each) * 72 <= width) ?? 12
  const start = new Date(from)
  let year = start.getUTCFullYear()
  let month = start.getUTCMonth() + 1
  const out: { time: number; label: string }[] = []
  while (out.length < 40) {
    if (month > 11) {
      year += Math.floor(month / 12)
      month %= 12
    }
    const time = Date.UTC(year, month, 1)
    if (time > to) break
    if (month % step === 0) {
      const label =
        step === 12
          ? String(year)
          : new Date(time).toLocaleDateString('en-GB', {
              month: 'short',
              ...(month === 0 || out.length === 0 ? { year: 'numeric' } : {}),
              timeZone: 'UTC',
            })
      out.push({ time, label })
    }
    month += 1
  }
  return out
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`
  return String(Math.round(value))
}

export function renderTimeline(input: TimelineInput): string {
  const { height, x, plotBottom, left } = layout(input)
  const parts: string[] = []

  // Grid and axis.
  for (const tick of ticks(input.from, input.to, input.width - left)) {
    const at = x(tick.time)
    parts.push(
      `<line x1="${at}" x2="${at}" y1="${TOP}" y2="${plotBottom}" stroke="var(--border)" />`,
      `<text x="${at + 4}" y="${height - 8}" font-size="11" fill="var(--foreground-muted)">${escapeHtml(tick.label)}</text>`,
    )
  }
  parts.push(
    `<line x1="${left}" x2="${input.width - 8}" y1="${plotBottom}" y2="${plotBottom}" stroke="var(--border-strong)" />`,
  )

  // Update bands, widest first so a short update stays visible on top.
  const visible = input.updates
    .filter((update) => {
      const start = Date.parse(update.start)
      const end = update.end ? Date.parse(update.end) : input.now
      return end >= input.from && start <= input.to
    })
    .sort(
      (a, b) =>
        (b.end ? Date.parse(b.end) : input.now) -
        Date.parse(b.start) -
        ((a.end ? Date.parse(a.end) : input.now) - Date.parse(a.start)),
    )
  for (const update of visible) {
    const start = Math.max(x(Date.parse(update.start)), left)
    const end = Math.min(
      x(update.end ? Date.parse(update.end) : input.now),
      input.width - 8,
    )
    const width = Math.max(3, end - start)
    const lane = LANES.indexOf(update.kind)
    const colour = KIND_COLOURS[update.kind]
    // The band starts at its lane, so the mark is its top edge.
    const laneTop = lane * (LANE + LANE_GAP)
    parts.push(
      `<g data-update-band="${escapeHtml(update.id)}">`,
      `<rect x="${start}" y="${laneTop}" width="${width}" height="${plotBottom - laneTop}" fill="${colour}" fill-opacity="0.14" />`,
      `<rect x="${start}" y="${laneTop}" width="${width}" height="${LANE}" fill="${colour}"${update.end ? '' : ' fill-opacity="0.6"'} />`,
      '</g>',
    )
  }

  // Today.
  if (input.now <= input.to && input.now >= input.from) {
    const at = x(input.now)
    parts.push(
      `<line x1="${at}" x2="${at}" y1="${TOP}" y2="${plotBottom}" stroke="var(--foreground-muted)" stroke-dasharray="2 3" />`,
    )
  }

  // The person's daily line.
  const days = input.days ?? []
  if (days.length > 1) {
    const max = Math.max(1, ...days.map((day) => day.value)) * 1.1
    const y = (value: number) =>
      plotBottom - (value / max) * (plotBottom - TOP - 8)
    for (const fraction of [0.5, 1]) {
      const value = (max / 1.1) * fraction
      parts.push(
        `<line x1="${left}" x2="${input.width - 8}" y1="${y(value)}" y2="${y(value)}" stroke="var(--border)" stroke-dasharray="3 3" />`,
        `<text x="${left - 6}" y="${y(value) + 4}" font-size="11" text-anchor="end" fill="var(--foreground-muted)">${compact(value)}</text>`,
      )
    }
    parts.push(
      `<text x="${left - 6}" y="${plotBottom + 4}" font-size="11" text-anchor="end" fill="var(--foreground-muted)">0</text>`,
    )
    let path = ''
    let previous = 0
    for (const day of days) {
      const time = dayTime(day.date)
      // A gap of more than a day is drawn as a gap, not a line through it.
      const move = !path || time - previous > 1.5 * DAY
      path += `${move ? 'M' : 'L'}${x(time).toFixed(1)},${y(day.value).toFixed(1)}`
      previous = time
    }
    parts.push(
      `<path d="${path}" fill="none" stroke="var(--foreground)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />`,
    )
    if (input.changeDate) {
      const at = x(dayTime(input.changeDate))
      const anchor = at > input.width - 140 ? 'end' : 'start'
      parts.push(
        `<line x1="${at}" x2="${at}" y1="${TOP}" y2="${plotBottom}" stroke="var(--destructive)" stroke-width="1.5" stroke-dasharray="4 3" />`,
        `<text x="${anchor === 'end' ? at - 6 : at + 6}" y="${TOP + 14}" font-size="11" text-anchor="${anchor}" fill="var(--destructive)">Change started</text>`,
      )
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${height}" viewBox="0 0 ${input.width} ${height}" class="block">${parts.join('')}</svg>`
}

/** The time under a pixel. */
export function timeAt(input: TimelineInput, pixel: number): number {
  return layout(input).time(pixel)
}

/** The update under a pixel, preferring the shortest so overlaps stay reachable. */
export function updateAt(
  input: TimelineInput,
  pixel: number,
): TimelineUpdate | undefined {
  const { time } = layout(input)
  const at = time(pixel)
  const slack = ((input.to - input.from) / Math.max(1, input.width)) * 4
  return input.updates
    .filter((update) => {
      const start = Date.parse(update.start) - slack
      const end = (update.end ? Date.parse(update.end) : input.now) + slack
      return at >= start && at <= end
    })
    .sort(
      (a, b) =>
        (a.end ? Date.parse(a.end) : input.now) -
        Date.parse(a.start) -
        ((b.end ? Date.parse(b.end) : input.now) - Date.parse(b.start)),
    )[0]
}
