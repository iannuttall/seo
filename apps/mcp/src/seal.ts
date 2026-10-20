// Sealed values: client ids, sign-in state, codes, tokens and the secrets
// kept in D1 are JSON encrypted with AES-GCM under SEAL_KEY. Only this server
// can read them. Each value names its kind, so one kind can never be used as
// another.

export type Sealed =
  // An MCP client's registration. ua is the client's own User-Agent, kept
  // only to record where a new person came from.
  | { k: 'client'; redirectUris: string[]; name: string; ua?: string | null }
  // An MCP client's sign-in, from /oauth/authorize to the Google callback.
  | {
      k: 'flow'
      clientId: string
      redirectUri: string
      state: string | null
      challenge: string
      exp: number
    }
  // A Google sign-in from the account page: to sign in, or to link another
  // account to a signed-in person.
  | { k: 'web'; userId: string | null; link?: string; exp: number }
  // A Bing sign-in from the account page.
  | { k: 'bing'; userId: string; exp: number }
  | {
      k: 'code'
      clientId: string
      redirectUri: string
      challenge: string
      userId: string
      exp: number
    }
  | { k: 'user-access'; userId: string; exp: number }
  | { k: 'user-refresh'; clientId: string; userId: string }
  // The account page's sign-in cookie, and its form token.
  | { k: 'session'; userId: string; exp: number }
  | { k: 'form'; userId: string; exp: number }
  // A CLI login waiting for approval, and a linked CLI's token. Both name
  // a row in cli_links, so removing the row ends them.
  | { k: 'cli-device'; linkId: string; exp: number }
  | { k: 'cli'; linkId: string }
  // A refresh token, access token or key kept in D1.
  | { k: 'secret'; value: string }

const PREFIX = 'sk1.'
const keys = new Map<string, Promise<CryptoKey>>()

function key(secret: string): Promise<CryptoKey> {
  let found = keys.get(secret)
  if (!found) {
    const raw = fromBase64(secret)
    if (raw.length !== 32) throw new Error('SEAL_KEY must be 32 bytes')
    found = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ])
    keys.set(secret, found)
  }
  return found
}

export async function seal(secret: string, value: Sealed): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(value))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await key(secret),
      data,
    ),
  )
  const out = new Uint8Array(iv.length + sealed.length)
  out.set(iv)
  out.set(sealed, iv.length)
  return PREFIX + toBase64Url(out)
}

export async function unseal<K extends Sealed['k']>(
  secret: string,
  value: string | null | undefined,
  kind: K,
): Promise<Extract<Sealed, { k: K }> | null> {
  if (!value?.startsWith(PREFIX)) return null
  try {
    const bytes = fromBase64(value.slice(PREFIX.length))
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await key(secret),
      bytes.slice(12),
    )
    const parsed = JSON.parse(new TextDecoder().decode(data)) as Sealed
    if (parsed.k !== kind) return null
    if ('exp' in parsed && parsed.exp < Date.now()) return null
    return parsed as Extract<Sealed, { k: K }>
  } catch {
    return null
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64(value: string): Uint8Array {
  const text = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return toBase64Url(new Uint8Array(digest))
}
