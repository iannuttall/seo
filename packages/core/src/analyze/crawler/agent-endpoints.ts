import type { publicHttpFetch } from '../../fetch/http-client.js'
import { fetchText, linkEntries, safeError } from './agent-discovery.js'
import type {
  AgentEndpointObservation,
  CrawlAgentDiscovery,
} from './agent-discovery-types.js'

const MAX_LINK_HEADER_ENTRIES = 25

// IANA-registered relation types that point agents at machine-readable
// resources (RFC 8288, RFC 9727).
const REGISTERED_AGENT_LINK_RELS = [
  'api-catalog',
  'describedby',
  'service-desc',
  'service-doc',
] as const

// Relation types from emerging agent conventions with no IANA registration.
const EMERGING_AGENT_LINK_RELS = ['agent-skills', 'llms-txt'] as const

type AgentEndpointProbe = {
  id: string
  path: string
  accept: string
  expects: 'json' | 'text'
  interestFields?: readonly string[]
  requiredFields?: readonly string[]
}

// Fixed probe order keeps endpoint output deterministic.
const AGENT_ENDPOINT_PROBES: readonly AgentEndpointProbe[] = [
  {
    id: 'mcp-server-card',
    path: '/.well-known/mcp/server-card.json',
    accept: 'application/json',
    expects: 'json',
    interestFields: ['serverInfo', 'transport', 'capabilities'],
    requiredFields: ['serverInfo'],
  },
  {
    id: 'mcp-server-cards',
    path: '/.well-known/mcp/server-cards.json',
    accept: 'application/json',
    expects: 'json',
    interestFields: ['serverCards', 'servers'],
  },
  {
    id: 'a2a-agent-card',
    path: '/.well-known/agent-card.json',
    accept: 'application/json',
    expects: 'json',
    interestFields: ['name', 'description', 'url', 'capabilities', 'skills'],
    requiredFields: ['name'],
  },
  {
    id: 'openid-configuration',
    path: '/.well-known/openid-configuration',
    accept: 'application/json',
    expects: 'json',
    interestFields: [
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'response_types_supported',
    ],
    requiredFields: ['issuer'],
  },
  {
    id: 'oauth-authorization-server',
    path: '/.well-known/oauth-authorization-server',
    accept: 'application/json',
    expects: 'json',
    interestFields: [
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'grant_types_supported',
    ],
    requiredFields: ['issuer'],
  },
  {
    id: 'oauth-protected-resource',
    path: '/.well-known/oauth-protected-resource',
    accept: 'application/json',
    expects: 'json',
    interestFields: ['resource', 'authorization_servers', 'scopes_supported'],
    requiredFields: ['resource'],
  },
  {
    id: 'api-catalog',
    path: '/.well-known/api-catalog',
    accept: 'application/linkset+json,application/json;q=0.9',
    expects: 'json',
    interestFields: ['linkset'],
    requiredFields: ['linkset'],
  },
  {
    id: 'web-bot-auth-directory',
    path: '/.well-known/http-message-signatures-directory',
    accept:
      'application/http-message-signatures-directory+json,application/json;q=0.9',
    expects: 'json',
    interestFields: ['keys'],
    requiredFields: ['keys'],
  },
  {
    id: 'auth-md',
    path: '/auth.md',
    accept: 'text/markdown,text/plain;q=0.9',
    expects: 'text',
  },
  {
    id: 'llms-full-txt',
    path: '/llms-full.txt',
    accept: 'text/plain,text/markdown;q=0.9',
    expects: 'text',
  },
]

async function inspectAgentEndpoint(input: {
  origin: string
  probe: AgentEndpointProbe
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<AgentEndpointObservation> {
  const url = new URL(input.probe.path, input.origin).toString()
  try {
    const { response, body } = await fetchText({
      url,
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
      accept: input.probe.accept,
    })
    const contentType = response.headers.get('content-type') ?? undefined
    // An HTML response at a machine-readable path is a catch-all page, not
    // the resource itself.
    const htmlFallback = /\btext\/html\b/iu.test(contentType ?? '')
    const exists =
      response.status >= 200 && response.status < 300 && !htmlFallback
    const observation: AgentEndpointObservation = {
      id: input.probe.id,
      url: response.url || url,
      status: response.status,
      exists,
      ...(contentType === undefined ? {} : { contentType }),
    }
    if (exists && input.probe.expects === 'json') {
      let parsed: Record<string, unknown> | undefined
      try {
        const value = JSON.parse(body) as unknown
        observation.validJson = true
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          parsed = value as Record<string, unknown>
        }
      } catch {
        observation.validJson = false
      }
      if (parsed) {
        const fields = [
          ...new Set([
            ...(input.probe.interestFields ?? []),
            ...(input.probe.requiredFields ?? []),
          ]),
        ].sort()
        observation.presentFields = fields.filter(
          (field) => parsed[field] !== undefined,
        )
        observation.missingFields = (input.probe.requiredFields ?? [])
          .filter((field) => parsed[field] === undefined)
          .sort()
      } else if (observation.validJson) {
        observation.presentFields = []
        observation.missingFields = [
          ...(input.probe.requiredFields ?? []),
        ].sort()
      }
    }
    return observation
  } catch (error) {
    return { id: input.probe.id, url, exists: false, error: safeError(error) }
  }
}

export async function inspectAgentEndpoints(input: {
  startUrl: string
  origin: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<NonNullable<CrawlAgentDiscovery['endpointDiscovery']>> {
  const [linkHeader, ...endpoints] = await Promise.all([
    (async (): Promise<
      NonNullable<CrawlAgentDiscovery['endpointDiscovery']>['linkHeader']
    > => {
      try {
        const { response } = await fetchText({
          url: input.startUrl,
          timeoutMs: input.timeoutMs,
          fetch: input.fetch,
          signal: input.signal,
          accept: 'text/html,application/xhtml+xml;q=0.9',
        })
        const entries = linkEntries(
          response.headers.get('link') ?? undefined,
          input.startUrl,
        )
          .slice(0, MAX_LINK_HEADER_ENTRIES)
          .map((entry) => ({
            url: entry.url,
            rel: entry.rel.filter(Boolean),
            ...(entry.type ? { type: entry.type } : {}),
          }))
        const observedRels = new Set(entries.flatMap((entry) => entry.rel))
        return {
          url: response.url || input.startUrl,
          status: response.status,
          entries,
          registeredRels: REGISTERED_AGENT_LINK_RELS.filter((rel) =>
            observedRels.has(rel),
          ),
          emergingRels: EMERGING_AGENT_LINK_RELS.filter((rel) =>
            observedRels.has(rel),
          ),
        }
      } catch (error) {
        return {
          url: input.startUrl,
          entries: [],
          registeredRels: [],
          emergingRels: [],
          error: safeError(error),
        }
      }
    })(),
    ...AGENT_ENDPOINT_PROBES.map((probe) =>
      inspectAgentEndpoint({
        origin: input.origin,
        probe,
        timeoutMs: input.timeoutMs,
        fetch: input.fetch,
        signal: input.signal,
      }),
    ),
  ])
  return { linkHeader, endpoints }
}
