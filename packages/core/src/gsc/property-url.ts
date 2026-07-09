import { SeoError } from '../errors.js'

function invalid(message: string): never {
  throw new SeoError('INVALID_INPUT', message)
}

export function normalizeHttpUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return invalid(`Invalid URL: ${value}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return invalid('The report URL must use http:// or https://.')
  }
  if (url.username || url.password) {
    return invalid('The report URL must not contain embedded credentials.')
  }

  url.hash = ''
  return url.toString()
}

export function assertUrlMatchesGscProperty(
  property: string,
  value: string,
): string {
  const url = normalizeHttpUrl(value)
  const parsed = new URL(url)

  if (property.startsWith('sc-domain:')) {
    const domain = property.slice('sc-domain:'.length).trim().toLowerCase()
    if (!domain || /[/:]/.test(domain)) {
      return invalid(`Invalid Search Console domain property: ${property}`)
    }
    const hostname = parsed.hostname.toLowerCase()
    if (hostname !== domain && !hostname.endsWith(`.${domain}`)) {
      return invalid(
        `${url} is outside the Search Console property ${property}.`,
      )
    }
    return url
  }

  const prefix = normalizeHttpUrl(property)
  if (!url.startsWith(prefix)) {
    return invalid(`${url} is outside the Search Console property ${property}.`)
  }
  return url
}
