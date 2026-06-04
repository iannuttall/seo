export function plural(
  count: number,
  singular: string,
  pluralLabel = `${singular}s`,
): string {
  return count === 1 ? singular : pluralLabel
}

export function countLabel(
  count: number,
  singular: string,
  pluralLabel = `${singular}s`,
): string {
  return `${count.toLocaleString('en-GB')} ${plural(count, singular, pluralLabel)}`
}
