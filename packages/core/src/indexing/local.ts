import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { hostname } from 'node:os'
import open from 'open'
import {
  cloudAccountUrl,
  cloudIndexMySiteToken,
  cloudIndexNowKeys,
  cloudLinked,
} from '../cloud.js'
import type { SubmitAccess } from '../commands/submit.js'
import { CommandError } from '../commands/types.js'
import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  readProviderSecret,
  writeProviderSecret,
} from '../storage/provider-secrets.js'
import {
  exchangeIndexMySiteCode,
  INDEXMYSITE_URL,
  IndexMySite,
  IndexMySiteGrantError,
  indexMySiteAuthorizeUrl,
  pkcePair,
  refreshIndexMySite,
  registerIndexMySiteClient,
  revokeIndexMySite,
} from './indexmysite.js'

// seo submit on this machine: IndexNow keys and the Index My Site
// connection, kept with the other provider secrets (the system keychain, or
// a private file). A machine linked to seoskill.dev uses the account's
// Index My Site connection and IndexNow keys as well.

// Index My Site's address. Only tests against a local mock change it.
const base = () => process.env.INDEXMYSITE_BASE_URL?.trim() || INDEXMYSITE_URL

// ---- IndexNow keys ----

async function savedIndexNowKeys(): Promise<Record<string, string>> {
  const saved = await readProviderSecret({
    name: PROVIDER_SECRET_NAMES.indexNowKeys,
  })
  if (!saved) return {}
  try {
    const parsed = JSON.parse(saved.value) as unknown
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

async function localIndexNowKey(host: string): Promise<string | null> {
  const saved = (await savedIndexNowKeys())[host]
  if (saved) return saved
  if (!cloudLinked()) return null
  const keys: Record<string, string> = await cloudIndexNowKeys().catch(
    () => ({}),
  )
  return keys[host] ?? null
}

async function saveLocalIndexNowKey(host: string, key: string): Promise<void> {
  const keys = await savedIndexNowKeys()
  keys[host] = key
  await writeProviderSecret(
    PROVIDER_SECRET_NAMES.indexNowKeys,
    JSON.stringify(keys),
  )
}

// ---- Index My Site ----

type SavedConnection = {
  clientId: string
  refresh: string
  access: string
  accessExp: number
  connectedAt: string
}

async function savedConnection(): Promise<SavedConnection | null> {
  const saved = await readProviderSecret({
    name: PROVIDER_SECRET_NAMES.indexMySiteOAuth,
  })
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved.value) as SavedConnection
    return parsed.clientId && parsed.refresh ? parsed : null
  } catch {
    return null
  }
}

const saveConnection = (connection: SavedConnection) =>
  writeProviderSecret(
    PROVIDER_SECRET_NAMES.indexMySiteOAuth,
    JSON.stringify(connection),
  )

// A current access token from this machine's own connection, refreshed and
// saved when it is about to expire, or null when there is none. A refresh
// token Index My Site no longer accepts is forgotten.
async function localToken(): Promise<string | null> {
  const saved = await savedConnection()
  if (!saved) return null
  if (saved.access && saved.accessExp > Date.now()) return saved.access
  try {
    const fresh = await refreshIndexMySite(
      { clientId: saved.clientId, base: base() },
      saved.refresh,
    )
    await saveConnection({ ...saved, ...fresh })
    return fresh.access
  } catch (error) {
    if (error instanceof IndexMySiteGrantError) {
      await deleteProviderSecret(PROVIDER_SECRET_NAMES.indexMySiteOAuth)
      throw new CommandError(
        'NOT_CONNECTED',
        `Index My Site no longer accepts this machine's sign-in (it was removed or replaced). Run \`seo providers indexmysite connect\` again.`,
      )
    }
    throw error
  }
}

export type IndexMySiteSource = 'machine' | 'account' | null

// Which connection seo submit uses here: this machine's own, else the
// linked seoskill.dev account's.
export async function localIndexMySiteSource(): Promise<IndexMySiteSource> {
  if (await savedConnection()) return 'machine'
  if (cloudLinked() && (await cloudIndexMySiteToken().catch(() => null))) {
    return 'account'
  }
  return null
}

async function anyToken(): Promise<string | null> {
  const own = await localToken()
  if (own) return own
  return cloudLinked() ? cloudIndexMySiteToken() : null
}

export async function localIndexMySite(): Promise<IndexMySite | null> {
  if (!(await anyToken())) return null
  return new IndexMySite(
    async () => {
      const token = await anyToken()
      if (!token) {
        throw new CommandError(
          'NOT_CONNECTED',
          'Index My Site is not connected any more.',
        )
      }
      return token
    },
    fetch,
    base(),
  )
}

const CONNECT_TIMEOUT_MS = 5 * 60_000

const page = (title: string, text: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;line-height:1.5"><h1 style="font-size:1.25rem">${title}</h1><p>${text}</p></body>`

export type LocalConnect = {
  // The Index My Site page to approve the connection on.
  url: string
  // Settles when the person approved (and the tokens are saved), denied,
  // or did nothing for five minutes.
  done: Promise<void>
}

// The browser sign-in for this machine: a loopback callback on 127.0.0.1,
// PKCE and state. The machine registers its own public client the first
// time, named after the machine.
export async function startLocalIndexMySiteConnect(): Promise<LocalConnect> {
  const { verifier, challenge } = await pkcePair()
  const state = crypto.randomUUID()
  let settle!: { resolve: () => void; reject: (error: Error) => void }
  const done = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject }
  })
  let redirectUri = ''
  let clientId = ''
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      response.writeHead(404).end()
      return
    }
    const finish = (status: number, title: string, text: string) => {
      response
        .writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
        .end(page(title, text))
    }
    if (url.searchParams.get('state') !== state) {
      finish(
        400,
        'This sign-in link is not for this request',
        'Run the connect step again.',
      )
      return
    }
    const code = url.searchParams.get('code')
    if (!code) {
      finish(
        400,
        'Index My Site was not connected',
        'The sign-in was cancelled. You can close this tab.',
      )
      settle.reject(
        new CommandError(
          'NOT_CONNECTED',
          'The Index My Site sign-in was cancelled.',
        ),
      )
      return
    }
    exchangeIndexMySiteCode(
      { clientId, base: base() },
      { code, redirectUri, verifier },
    )
      .then((tokens) =>
        saveConnection({
          clientId,
          ...tokens,
          connectedAt: new Date().toISOString(),
        }),
      )
      .then(() => {
        finish(
          200,
          'Index My Site is connected to SEO Skill',
          'You can close this tab and go back to your terminal or agent.',
        )
        settle.resolve()
      })
      .catch((error: Error) => {
        finish(
          500,
          'Index My Site was not connected',
          'Run the connect step again.',
        )
        settle.reject(error)
      })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  redirectUri = `http://127.0.0.1:${port}/callback`
  const timer = setTimeout(
    () =>
      settle.reject(
        new CommandError(
          'NOT_CONNECTED',
          'Nobody approved the Index My Site sign-in within five minutes. Run the connect step again.',
        ),
      ),
    CONNECT_TIMEOUT_MS,
  )
  done
    .finally(() => {
      clearTimeout(timer)
      server.close()
    })
    .catch(() => undefined)
  try {
    clientId =
      (await savedConnection())?.clientId ??
      (await registerIndexMySiteClient({
        name: `SEO Skill on ${hostname().split('.')[0] || 'this machine'}`,
        // Index My Site allows any port on a loopback address.
        redirectUri: 'http://127.0.0.1/callback',
        base: base(),
      }))
  } catch (error) {
    settle.reject(error as Error)
    throw error
  }
  const url = indexMySiteAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    challenge,
    base: base(),
  })
  await open(url).catch(() => undefined)
  return { url, done }
}

// Removes this machine's connection and ends its grant at Index My Site.
export async function disconnectLocalIndexMySite(): Promise<boolean> {
  const saved = await savedConnection()
  if (!saved) return false
  await revokeIndexMySite(
    { clientId: saved.clientId, base: base() },
    saved.refresh,
  )
  await deleteProviderSecret(PROVIDER_SECRET_NAMES.indexMySiteOAuth)
  return true
}

const ACCOUNT_CONNECT = () =>
  `This machine uses your seoskill.dev account, so connect Index My Site there: open ${cloudAccountUrl()}#indexmysite in the person's browser and ask them to choose Connect Index My Site, then run the same call again.`

// The local MCP's connect action: one sign-in at a time per server
// process, reported on the next call.
let pending: {
  url: string
  state: 'waiting' | 'failed'
  error?: string
} | null = null

async function mcpConnect(): Promise<string> {
  if (await savedConnection()) {
    return 'Index My Site is connected on this machine. To connect another account, run `seo providers indexmysite disconnect` first.'
  }
  if (cloudLinked()) {
    if (await cloudIndexMySiteToken({ fresh: true }).catch(() => null)) {
      return 'Index My Site is connected through your seoskill.dev account.'
    }
    return ACCOUNT_CONNECT()
  }
  if (pending?.state === 'waiting') {
    return `Waiting for the person to approve the connection at ${pending.url}. Call indexmysite_connect again once they have.`
  }
  const failed = pending?.state === 'failed' ? pending.error : null
  const started = await startLocalIndexMySiteConnect()
  const current = { url: started.url, state: 'waiting' as const }
  pending = current
  started.done.then(
    () => {
      if (pending === current) pending = null
    },
    (error: Error) => {
      if (pending === current) {
        pending = { url: started.url, state: 'failed', error: error.message }
      }
    },
  )
  return `${failed ? `The last sign-in did not finish (${failed}). ` : ''}The Index My Site sign-in opened in this machine's browser. If it did not, show the person this link: ${started.url}\nAsk them to sign in to Index My Site and approve SEO Skill, then call indexmysite_connect again to confirm.`
}

// seo submit's access on this machine, for the CLI and the local MCP.
export function localSubmitAccess(): SubmitAccess {
  return {
    indexNowKey: localIndexNowKey,
    saveIndexNowKey: saveLocalIndexNowKey,
    indexMySite: localIndexMySite,
    connectIndexMySite: mcpConnect,
    indexMySiteConnect: cloudLinked()
      ? ACCOUNT_CONNECT()
      : 'Connect it with `seo providers indexmysite connect` in a terminal, or seo_submit with action indexmysite_connect: both open an Index My Site sign-in in the browser.',
  }
}
