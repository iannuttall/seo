import type { AccessBlockEvidence } from '../types.js'
import { SEO_CRAWLER_IDENTITY } from './crawler-identity.js'

const CLOUDFLARE_SKIP_DOCS =
  'https://developers.cloudflare.com/waf/custom-rules/skip/'

type HeadersLike = { get(name: string): string | null }
type HeaderInput = HeadersLike | Record<string, string>

function isHeadersLike(headers: HeaderInput): headers is HeadersLike {
  return 'get' in headers && typeof headers.get === 'function'
}

function headerValue(headers: HeaderInput, name: string): string | undefined {
  if (isHeadersLike(headers)) {
    return headers.get(name) ?? undefined
  }
  const lower = name.toLowerCase()
  return (
    headers[name] ??
    headers[lower] ??
    Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1]
  )
}

function cloudflareEvidence(headers: HeaderInput): {
  detected: boolean
  challenge: boolean
  rayId?: string
  indicators: string[]
} {
  const mitigated = headerValue(headers, 'cf-mitigated')
  const rayId = headerValue(headers, 'cf-ray')
  const server = headerValue(headers, 'server')
  const challenge = mitigated?.toLowerCase() === 'challenge'
  const indicators = [
    ...(challenge ? ['cf-mitigated: challenge'] : []),
    ...(rayId ? [`cf-ray: ${rayId}`] : []),
    ...(server?.toLowerCase().includes('cloudflare')
      ? [`server: ${server}`]
      : []),
  ]
  return {
    detected: challenge || Boolean(rayId) || Boolean(indicators.length),
    challenge,
    rayId,
    indicators,
  }
}

function blockKind(
  status: number,
  cloudflareChallenge: boolean,
): AccessBlockEvidence['kind'] {
  if (cloudflareChallenge) return 'challenge'
  if (status === 429) return 'rate-limit'
  if (status === 401) return 'authentication'
  return 'firewall'
}

export function detectAccessBlock(input: {
  status: number
  headers: HeaderInput
}): AccessBlockEvidence | undefined {
  const cloudflare = cloudflareEvidence(input.headers)
  const denied = [401, 403, 429].includes(input.status)
  if (!denied && !cloudflare.challenge) return undefined

  const provider = cloudflare.detected ? 'cloudflare' : 'unknown'
  const kind = blockKind(input.status, cloudflare.challenge)
  const indicators = [`HTTP ${input.status}`, ...cloudflare.indicators]

  if (provider === 'cloudflare') {
    return {
      provider,
      kind,
      status: input.status,
      crawler: SEO_CRAWLER_IDENTITY,
      indicators,
      ...(cloudflare.rayId ? { requestId: cloudflare.rayId } : {}),
      guidance: {
        summary:
          kind === 'challenge'
            ? 'Cloudflare returned a Challenge Page to the crawler.'
            : 'The crawler received a denied or rate-limited response through Cloudflare.',
        recommendedAction:
          'Look for this request in Cloudflare Security Events. If Cloudflare blocked it, create the narrowest custom Skip rule that matches the audit machine source IP, hostname or required paths, and this exact User-Agent. Skip only the product or rule that caused the block. If there is no matching event, inspect the origin security logs.',
        securityNote:
          'A User-Agent can be spoofed. Do not trust it by itself or create a broad site-wide bypass. Remove temporary access after the audit. Bot Fight Mode cannot be skipped by a custom rule.',
        documentationUrl: CLOUDFLARE_SKIP_DOCS,
      },
    }
  }

  return {
    provider,
    kind,
    status: input.status,
    crawler: SEO_CRAWLER_IDENTITY,
    indicators,
    guidance: {
      summary:
        kind === 'rate-limit'
          ? 'The site rate-limited the crawler request.'
          : 'The site denied the crawler request.',
      recommendedAction:
        'Inspect the site, CDN, and origin security logs for this request. If the audit should have access, allow the audit machine source IP and this exact User-Agent only on the public paths being checked, or lower the crawl rate.',
      securityNote:
        'A User-Agent can be spoofed. Do not trust it by itself or create a broad site-wide bypass. Remove temporary access after the audit.',
    },
  }
}
