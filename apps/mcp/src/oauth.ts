import { agentFromClientName } from '@seo/core/hosted'
import { view } from './page.ts'
import { googleSignedIn, googleSignInUrl } from './providers.ts'
import { type Sealed, seal, sha256Base64Url, unseal } from './seal.ts'
import { firstTouch, type SignupSource, userAgentOf } from './signup.ts'
import { createUser, linkAccount, ownerOf, userExists } from './store.ts'

// OAuth for MCP clients, with Google as the sign-in. The client id, sign-in
// state and code are sealed values the client carries. Our tokens carry only
// the person's id; their Google and Bing sign-ins and keys stay in D1.

const FLOW_TTL = 10 * 60_000
const CODE_TTL = 2 * 60_000
const ACCESS_TTL = 60 * 60_000

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status)

export function resourceMetadata(env: Env): Response {
  return json({
    resource: `${env.PUBLIC_URL}/mcp`,
    authorization_servers: [env.PUBLIC_URL],
    bearer_methods_supported: ['header'],
    resource_name: 'SEO Skill',
  })
}

export function serverMetadata(env: Env): Response {
  return json({
    issuer: env.PUBLIC_URL,
    authorization_endpoint: `${env.PUBLIC_URL}/oauth/authorize`,
    token_endpoint: `${env.PUBLIC_URL}/oauth/token`,
    registration_endpoint: `${env.PUBLIC_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    service_documentation: `${env.PUBLIC_URL}/features/mcp`,
  })
}

// The header that sends a client without a token to sign in.
// RFC 9728: the metadata for https://host/base/mcp lives at
// https://host/.well-known/oauth-protected-resource/base/mcp.
function resourceMetadataUrl(env: Env): string {
  const url = new URL(env.PUBLIC_URL)
  const base = url.pathname.replace(/\/$/, '')
  return `${url.origin}/.well-known/oauth-protected-resource${base}/mcp`
}

export function challenge(env: Env): Response {
  return json(
    { error: 'unauthorized', error_description: 'Sign in with Google.' },
    401,
    {
      'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl(env)}"`,
    },
  )
}

function allowedRedirect(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.hash) return false
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:') {
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  }
  // Native apps use their own schemes, such as cursor:// or vscode://.
  return !['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'].includes(
    url.protocol,
  )
}

export async function register(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    redirect_uris?: unknown
    client_name?: unknown
  } | null
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : []
  if (
    uris.length === 0 ||
    uris.length > 10 ||
    !uris.every((uri) => typeof uri === 'string' && allowedRedirect(uri))
  ) {
    return oauthError(
      'invalid_redirect_uri',
      'Send one to ten redirect URIs: https, localhost http, or an app scheme.',
    )
  }
  const name =
    typeof body?.client_name === 'string'
      ? body.client_name.slice(0, 80)
      : 'MCP client'
  const clientId = await seal(env.SEAL_KEY, {
    k: 'client',
    redirectUris: uris as string[],
    name,
    ua: userAgentOf(request),
  })
  return json(
    {
      client_id: clientId,
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    201,
  )
}

// Shows which app asks for access before Google sign-in. A client registers
// itself, so the person must see the app name and where the code will go.
export async function authorize(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams
  const clientId = params.get('client_id') ?? ''
  const client = await unseal(env.SEAL_KEY, clientId, 'client')
  const redirectUri = params.get('redirect_uri') ?? ''
  if (!client?.redirectUris.includes(redirectUri)) {
    return view(
      env,
      {
        view: 'notice',
        notice: {
          title: 'Sign-in link not valid',
          text: 'This sign-in link is not valid. Start again from your agent.',
        },
      },
      400,
    )
  }
  const fail = (error: string, description: string) => {
    const url = new URL(redirectUri)
    url.searchParams.set('error', error)
    url.searchParams.set('error_description', description)
    const state = params.get('state')
    if (state) url.searchParams.set('state', state)
    return Response.redirect(url.toString(), 302)
  }
  if (params.get('response_type') !== 'code') {
    return fail('unsupported_response_type', 'Use response_type=code.')
  }
  const challengeValue = params.get('code_challenge') ?? ''
  if (
    params.get('code_challenge_method') !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(challengeValue)
  ) {
    return fail('invalid_request', 'PKCE with S256 is required.')
  }
  const flow = await seal(env.SEAL_KEY, {
    k: 'flow',
    clientId,
    redirectUri,
    state: params.get('state'),
    challenge: challengeValue,
    exp: Date.now() + FLOW_TTL,
  })
  const host = new URL(redirectUri).host || new URL(redirectUri).protocol
  return view(env, {
    view: 'connect',
    connect: { client: client.name, host, flow },
  })
}

export async function toGoogle(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null)
  const sealedFlow = form?.get('flow')
  const flow = await unseal(
    env.SEAL_KEY,
    typeof sealedFlow === 'string' ? sealedFlow : null,
    'flow',
  )
  if (!flow) {
    return view(
      env,
      {
        view: 'notice',
        notice: {
          title: 'Sign-in expired',
          text: 'This sign-in has expired. Start again from your agent.',
        },
      },
      400,
    )
  }
  return Response.redirect(
    googleSignInUrl(env, await seal(env.SEAL_KEY, flow)),
    302,
  )
}

// The person who owns a Google account, created on first sign-in with where
// they came from. The account's tokens are saved for them.
export async function signInPerson(
  env: Env,
  code: string,
  into: string | null,
  source: () => Promise<SignupSource>,
): Promise<string | null> {
  const signedIn = await googleSignedIn(env, code)
  if (!signedIn) return null
  const userId =
    into ??
    (await ownerOf(env, 'google', signedIn.subject)) ??
    (await createUser(env, await source()))
  await linkAccount(env, userId, {
    provider: 'google',
    subject: signedIn.subject,
    label: signedIn.email,
    refresh: signedIn.refresh,
    access: signedIn.access,
    accessExp: signedIn.accessExp,
  })
  return userId
}

// Google sends both MCP sign-ins and account page sign-ins here.
export async function callback(
  request: Request,
  env: Env,
  web: (
    request: Request,
    state: Extract<Sealed, { k: 'web' }>,
  ) => Promise<Response>,
): Promise<Response> {
  const params = new URL(request.url).searchParams
  const state = params.get('state')
  const fromPage = await unseal(env.SEAL_KEY, state, 'web')
  if (fromPage) return web(request, fromPage)
  const flow = await unseal(env.SEAL_KEY, state, 'flow')
  if (!flow) {
    return view(
      env,
      {
        view: 'notice',
        notice: {
          title: 'Sign-in expired',
          text: 'This sign-in has expired. Start again from your agent.',
        },
      },
      400,
    )
  }
  const back = new URL(flow.redirectUri)
  if (flow.state) back.searchParams.set('state', flow.state)
  back.searchParams.set('iss', env.PUBLIC_URL)
  const code = params.get('code')
  if (!code) {
    back.searchParams.set('error', 'access_denied')
    back.searchParams.set('error_description', 'Google sign-in was cancelled.')
    return Response.redirect(back.toString(), 302)
  }
  const userId = await signInPerson(env, code, null, async () => {
    const client = await unseal(env.SEAL_KEY, flow.clientId, 'client')
    const name = client?.name ?? null
    return {
      entry: 'mcp',
      client: agentFromClientName(name),
      clientName: name,
      userAgent: client?.ua ?? null,
      ...firstTouch(request),
    }
  })
  if (!userId) {
    back.searchParams.set('error', 'server_error')
    back.searchParams.set(
      'error_description',
      'Google did not return a sign-in. Try again.',
    )
    return Response.redirect(back.toString(), 302)
  }
  back.searchParams.set(
    'code',
    await seal(env.SEAL_KEY, {
      k: 'code',
      clientId: flow.clientId,
      redirectUri: flow.redirectUri,
      challenge: flow.challenge,
      userId,
      exp: Date.now() + CODE_TTL,
    }),
  )
  return Response.redirect(back.toString(), 302)
}

async function issue(
  env: Env,
  input: { clientId: string; userId: string },
): Promise<Response> {
  return json({
    access_token: await seal(env.SEAL_KEY, {
      k: 'user-access',
      userId: input.userId,
      exp: Date.now() + ACCESS_TTL,
    }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL / 1000,
    refresh_token: await seal(env.SEAL_KEY, {
      k: 'user-refresh',
      clientId: input.clientId,
      userId: input.userId,
    }),
  })
}

export async function token(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null)
  const field = (name: string) => {
    const value = form?.get(name)
    return typeof value === 'string' ? value : ''
  }
  const grant = field('grant_type')
  if (grant === 'authorization_code') {
    const code = await unseal(env.SEAL_KEY, field('code'), 'code')
    if (
      !code ||
      code.clientId !== field('client_id') ||
      code.redirectUri !== field('redirect_uri') ||
      (await sha256Base64Url(field('code_verifier'))) !== code.challenge
    ) {
      return oauthError('invalid_grant', 'The code is not valid or expired.')
    }
    return issue(env, code)
  }
  if (grant === 'refresh_token') {
    const refresh = await unseal(
      env.SEAL_KEY,
      field('refresh_token'),
      'user-refresh',
    )
    if (
      !refresh ||
      refresh.clientId !== field('client_id') ||
      !(await userExists(env, refresh.userId))
    ) {
      return oauthError('invalid_grant', 'Sign in again.')
    }
    return issue(env, refresh)
  }
  return oauthError(
    'unsupported_grant_type',
    'Use authorization_code or refresh_token.',
  )
}

// The person a bearer token belongs to, or null.
export async function userOf(
  request: Request,
  env: Env,
): Promise<string | null> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)
  return (
    (await unseal(env.SEAL_KEY, bearer?.[1], 'user-access'))?.userId ?? null
  )
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
