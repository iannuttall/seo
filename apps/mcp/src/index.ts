import { keysPage } from './keys-page.ts'
import { serveMcp } from './mcp.ts'
import {
  authorize,
  callback,
  challenge,
  googleAccess,
  register,
  resourceMetadata,
  serverMetadata,
  toGoogle,
  token,
} from './oauth.ts'

// seoskill.dev routes /mcp, /oauth/* and /.well-known/oauth-* to this Worker.
// The static site Worker serves everything else.

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
  'access-control-max-age': '86400',
}

function withCors(response: Response): Response {
  const out = new Response(response.body, response)
  for (const [name, value] of Object.entries(cors)) out.headers.set(name, value)
  return out
}

// PUBLIC_URL can carry a path, such as https://example.com/seo. Routes below are
// relative to it; the well-known documents stay at the origin root.
export function localPath(env: Env, pathname: string): string {
  const base = new URL(env.PUBLIC_URL).pathname.replace(/\/$/, '')
  if (pathname.startsWith('/.well-known/')) return pathname
  return base && pathname.startsWith(base)
    ? pathname.slice(base.length) || '/'
    : pathname
}

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const pathname = localPath(env, new URL(request.url).pathname)
  const method = request.method
  if (pathname.startsWith('/.well-known/oauth-protected-resource')) {
    return resourceMetadata(env)
  }
  if (pathname.startsWith('/.well-known/oauth-authorization-server')) {
    return serverMetadata(env)
  }
  if (pathname === '/oauth/register' && method === 'POST') {
    return register(request, env)
  }
  if (pathname === '/oauth/authorize' && method === 'GET') {
    return authorize(request, env)
  }
  if (pathname === '/oauth/google' && method === 'POST') {
    return toGoogle(request, env)
  }
  if (pathname === '/oauth/callback' && method === 'GET') {
    return callback(request, env)
  }
  if (pathname === '/oauth/token' && method === 'POST') {
    return token(request, env)
  }
  if (pathname === '/mcp/keys' && method === 'GET') {
    return keysPage(env)
  }
  if (pathname === '/mcp') {
    const access = await googleAccess(request, env)
    if (!access) return challenge(env)
    if (method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } })
    }
    // Keys sent as headers win over keys sealed in at sign-in.
    const headers = new Headers(access.keys)
    for (const [name, value] of request.headers) headers.set(name, value)
    return serveMcp(request, {
      env,
      google: access.token,
      headers,
      waitUntil: (promise) => ctx.waitUntil(promise),
    })
  }
  return new Response('Not found', { status: 404 })
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = localPath(env, new URL(request.url).pathname)
    const api =
      pathname !== '/mcp/keys' &&
      !pathname.startsWith('/oauth/authorize') &&
      !pathname.startsWith('/oauth/google') &&
      !pathname.startsWith('/oauth/callback')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const response = await route(request, env, ctx)
    return api ? withCors(response) : response
  },
} satisfies ExportedHandler<Env>
