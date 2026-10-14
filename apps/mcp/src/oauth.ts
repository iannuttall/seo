import { page } from './page.ts'
import {
  type Keys,
  type Sealed,
  seal,
  sha256Base64Url,
  unseal,
} from './seal.ts'

// OAuth for MCP clients, with Google as the only sign-in. Nothing is stored:
// the client id, sign-in state, code and tokens are sealed values that the
// client carries. Our access token wraps a Google access token, and our
// refresh token wraps the Google refresh token.

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
]

// Keys a person can add on the sign-in page. They are sealed into the tokens
// their agent keeps, and sent to tools as these request headers.
export const KEY_FIELDS: { header: string; label: string; secret: boolean }[] =
  [
    {
      header: 'x-dataforseo-login',
      label: 'DataForSEO API login',
      secret: false,
    },
    {
      header: 'x-dataforseo-password',
      label: 'DataForSEO API password',
      secret: true,
    },
    { header: 'x-ahrefs-key', label: 'Ahrefs API key', secret: true },
  ]

const FLOW_TTL = 10 * 60_000
const CODE_TTL = 2 * 60_000
const EARLY = 60_000

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
    return page(
      'Sign-in link not valid',
      '<p>This sign-in link is not valid. Start again from your agent.</p>',
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
  return page(
    'Connect SEO Skill',
    `<h1>Connect SEO Skill</h1>
<p><strong>${escapeHtml(client.name)}</strong> wants to read your Search Console and Google Analytics data through SEO Skill. After you sign in, Google sends you back to <strong>${escapeHtml(host)}</strong>.</p>
<p>SEO Skill stores nothing. Your agent keeps the sign-in, and you can remove it at any time in your <a href="https://myaccount.google.com/connections">Google account</a>.</p>
<form method="post" action="${escapeHtml(env.PUBLIC_URL)}/oauth/google"><input type="hidden" name="flow" value="${escapeHtml(flow)}">
<details><summary>Add your own API keys (optional)</summary>
<p class="small">For keyword, competitor and analytics data from your own accounts. The keys are sealed into your agent's sign-in, not saved here. To change them, connect again.</p>
${KEY_FIELDS.map((field) => `<label>${field.label}<input name="${field.header}" type="${field.secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false"></label>`).join('\n')}
</details>
<button type="submit">Continue with Google</button></form>
<p class="small">Only continue if you started this from your own agent.</p>`,
  )
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
    return page(
      'Sign-in expired',
      '<p>This sign-in has expired. Start again from your agent.</p>',
      400,
    )
  }
  const keys: Keys = {}
  for (const field of KEY_FIELDS) {
    const value = form?.get(field.header)
    if (typeof value === 'string' && value.trim()) {
      keys[field.header] = value.trim().slice(0, 500)
    }
  }
  const state = await seal(env.SEAL_KEY, {
    ...flow,
    ...(Object.keys(keys).length ? { keys } : {}),
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${env.PUBLIC_URL}/oauth/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('state', state)
  return Response.redirect(url.toString(), 302)
}

type GoogleTokens = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

async function googleToken(
  env: Env,
  body: Record<string, string>,
): Promise<GoogleTokens | { error: string; error_description?: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...body,
    }),
  })
  return (await response.json()) as GoogleTokens
}

export async function callback(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams
  const flow = await unseal(env.SEAL_KEY, params.get('state'), 'flow')
  if (!flow) {
    return page(
      'Sign-in expired',
      '<p>This sign-in has expired. Start again from your agent.</p>',
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
  const tokens = await googleToken(env, {
    code,
    grant_type: 'authorization_code',
    redirect_uri: `${env.PUBLIC_URL}/oauth/callback`,
  })
  if ('error' in tokens || !tokens.refresh_token) {
    back.searchParams.set('error', 'server_error')
    back.searchParams.set(
      'error_description',
      'Google did not return a sign-in. Try again.',
    )
    return Response.redirect(back.toString(), 302)
  }
  const now = Date.now()
  back.searchParams.set(
    'code',
    await seal(env.SEAL_KEY, {
      k: 'code',
      clientId: flow.clientId,
      redirectUri: flow.redirectUri,
      challenge: flow.challenge,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessExp: now + tokens.expires_in * 1000 - EARLY,
      scope: tokens.scope ?? '',
      keys: flow.keys,
      exp: now + CODE_TTL,
    }),
  )
  return Response.redirect(back.toString(), 302)
}

async function issue(
  env: Env,
  input: {
    clientId: string
    accessToken: string
    accessExp: number
    refreshToken: string
    scope: string
    keys?: Keys
  },
): Promise<Response> {
  const access: Sealed = {
    k: 'access',
    token: input.accessToken,
    scope: input.scope,
    keys: input.keys,
    exp: input.accessExp,
  }
  return json({
    access_token: await seal(env.SEAL_KEY, access),
    token_type: 'Bearer',
    expires_in: Math.max(60, Math.floor((input.accessExp - Date.now()) / 1000)),
    refresh_token: await seal(env.SEAL_KEY, {
      k: 'refresh',
      clientId: input.clientId,
      token: input.refreshToken,
      scope: input.scope,
      keys: input.keys,
    }),
    scope: input.scope,
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
    return issue(env, { ...code, clientId: code.clientId })
  }
  if (grant === 'refresh_token') {
    const refresh = await unseal(
      env.SEAL_KEY,
      field('refresh_token'),
      'refresh',
    )
    if (!refresh || refresh.clientId !== field('client_id')) {
      return oauthError('invalid_grant', 'The refresh token is not valid.')
    }
    const tokens = await googleToken(env, {
      grant_type: 'refresh_token',
      refresh_token: refresh.token,
    })
    if ('error' in tokens) {
      return oauthError(
        'invalid_grant',
        'Google refused the refresh. Sign in again.',
      )
    }
    return issue(env, {
      clientId: refresh.clientId,
      accessToken: tokens.access_token,
      accessExp: Date.now() + tokens.expires_in * 1000 - EARLY,
      refreshToken: tokens.refresh_token ?? refresh.token,
      scope: tokens.scope ?? refresh.scope,
      keys: refresh.keys,
    })
  }
  return oauthError(
    'unsupported_grant_type',
    'Use authorization_code or refresh_token.',
  )
}

// The Google access token inside a bearer token, or null.
export async function googleAccess(
  request: Request,
  env: Env,
): Promise<{ token: string; scope: string; keys: Keys } | null> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)
  const access = await unseal(env.SEAL_KEY, bearer?.[1], 'access')
  return access
    ? { token: access.token, scope: access.scope, keys: access.keys ?? {} }
    : null
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
