import {
  account,
  accountCallback,
  bingCallback,
  propertiesCallback,
} from './account.ts'
import { startDue } from './audit/schedule.ts'
import { betaFlags } from './beta.ts'
import { credentials, finishLogin, logout, startLogin } from './cli.ts'
import { failureReport } from './failure-report.ts'
import { directory } from './google.ts'
import { serveMcp, serverCard } from './mcp.ts'
import {
  authorize,
  callback,
  challenge,
  register,
  resourceMetadata,
  serverMetadata,
  toGoogle,
  token,
  userOf,
} from './oauth.ts'
import { unseal } from './seal.ts'
import { sendSignupReport, sendTelegram } from './signup-report.ts'
import { accountsOf, keysOf } from './store.ts'

export { SiteAudit } from './audit/site-audit.ts'

// seoskill.dev routes /mcp, /oauth/*, /account, /.well-known/oauth-* and
// /.well-known/mcp/* to this Worker.
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
  if (pathname === '/.well-known/mcp/server-card.json') return serverCard()
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
    const write = await unseal(
      env.SEAL_KEY,
      new URL(request.url).searchParams.get('state'),
      'gsc-write',
    )
    if (write) return propertiesCallback(request, env, write)
    return callback(request, env, (req, state) =>
      accountCallback(req, env, state),
    )
  }
  if (pathname === '/oauth/bing/callback' && method === 'GET') {
    return bingCallback(request, env)
  }
  // `seo login` and a linked CLI. See cli.ts.
  if (pathname === '/account/cli/start' && method === 'POST') {
    return startLogin(request, env)
  }
  if (pathname === '/account/cli/token' && method === 'POST') {
    return finishLogin(request, env)
  }
  if (pathname === '/account/cli/credentials' && method === 'GET') {
    return credentials(request, env)
  }
  if (pathname === '/account/cli/logout' && method === 'POST') {
    return logout(request, env)
  }
  if (pathname === '/account' || pathname.startsWith('/account/')) {
    return account(request, env, pathname)
  }
  if (pathname === '/oauth/token' && method === 'POST') {
    return token(request, env)
  }
  // Key setup lives in the site docs.
  if (pathname === '/mcp/keys' && method === 'GET') {
    return new Response(null, {
      status: 301,
      headers: { location: '/docs/keys' },
    })
  }
  if (pathname === '/mcp') {
    const userId = await userOf(request, env)
    if (!userId) return challenge(env)
    if (method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } })
    }
    const [accounts, keys, beta] = await Promise.all([
      accountsOf(env, userId),
      keysOf(env, userId),
      betaFlags(env, userId),
    ])
    // A deleted person, or one with no Google account, signs in again.
    if (!accounts.some((item) => item.provider === 'google')) {
      return challenge(env)
    }
    // Keys sent as headers win over saved keys.
    const headers = new Headers(keys)
    for (const [name, value] of request.headers) headers.set(name, value)
    return serveMcp(request, {
      env,
      userId,
      beta,
      directory: directory(env, accounts),
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
      pathname !== '/account' &&
      !pathname.startsWith('/account/') &&
      !pathname.startsWith('/oauth/authorize') &&
      !pathname.startsWith('/oauth/google') &&
      !pathname.startsWith('/oauth/callback') &&
      !pathname.startsWith('/oauth/bing/')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const response = await route(request, env, ctx)
    return api ? withCors(response) : response
  },
  // The weekly sign-up and failure counts for Ian's Telegram
  // (wrangler.jsonc triggers).
  async scheduled(controller, env, ctx) {
    if (controller.cron === '17 * * * *') {
      ctx.waitUntil(startDue(env, controller.scheduledTime))
      return
    }
    const now = new Date(controller.scheduledTime)
    ctx.waitUntil(sendSignupReport(env, now))
    ctx.waitUntil(sendTelegram(env, () => failureReport(env.TELEMETRY_DB, now)))
  },
} satisfies ExportedHandler<Env>
