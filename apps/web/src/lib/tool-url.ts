export function defaultToolUrlToHttps(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
