// Number helpers shared by the blog charts, at build time and in the browser.

export const formatNumber = (value: number) => value.toLocaleString('en-US')

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
export const compactNumber = (value: number) => compact.format(value)

/** The top of a value scale: the peak rounded up to a round step, so the half line is round too. */
export function niceTop(peak: number): number {
  if (peak <= 1) return 1
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  return (
    ([1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((step) => step * magnitude >= peak) ??
      10) * magnitude
  )
}

/** Series colours, in order: the accent, then quieter tokens. */
export const seriesColours = [
  'var(--primary)',
  'var(--foreground-soft)',
  'var(--warning)',
  'var(--success)',
]
