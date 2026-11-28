import type { LinkedAccounts } from '@seo/core/commands'
import { readableSites } from '@seo/core/commands'
import {
  finalGscDateRange,
  isoWeek,
  readJson,
  searchAnalyticsRows,
} from '@seo/core/hosted'
import { stripe } from './billing.ts'
import { accountUrl } from './google.ts'
import { addFreeCredit } from './meter.ts'
import { toBase64Url } from './seal.ts'
import { sendTelegram } from './signup-report.ts'

// The one-off $1 free credit (migrations/0026_plans.sql), with its checks
// against repeat sign-ups. One credit per linked group of Search Console
// sites, only for a site on its own domain with search impressions, held
// for a card when Turnstile failed or the network block had 3 this week,
// and at most DAILY_CAP a day across every account. Only salted hashes of
// sites, network blocks and card fingerprints are kept.

const DAY_MS = 86_400_000
export const DAILY_CAP = 50
export const IP_WEEKLY_LIMIT = 3
const IP_KEEP_MS = 30 * DAY_MS
const IMPRESSION_DAYS = 90
// Bounds on one check: the properties hashed, and the properties asked
// for impressions.
const MAX_SITES = 1_000
const MAX_IMPRESSION_CHECKS = 5
// How often a credit still waiting for a site is checked against Google.
const RECHECK_PENDING_MS = 10 * 60_000
const RECHECK_SITE_MS = 6 * 60 * 60_000
const TURNSTILE_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// A heuristic, not a full public suffix list: common free hosts where
// anyone gets a subdomain in a minute, so a property there does not show a
// real site of one's own.
const FREE_HOSTS = [
  'github.io',
  'gitlab.io',
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'workers.dev',
  'web.app',
  'firebaseapp.com',
  'herokuapp.com',
  'onrender.com',
  'fly.dev',
  'replit.app',
  'glitch.me',
  'blogspot.com',
  'wordpress.com',
  'wixsite.com',
  'squarespace.com',
  'webflow.io',
  'framer.website',
  'carrd.co',
  'notion.site',
  'substack.com',
  'surge.sh',
]

type State =
  | 'pending'
  | 'granted'
  | 'held_card'
  | 'held_site'
  | 'held_cap'
  | 'linked'

type Row = {
  state: State
  human: number | null
  ip_hash: string | null
  checked_at: number | null
}

// The credit runs only with the usage plans on and SEO Skill's own
// DataForSEO login set.
function creditOn(env: Env): boolean {
  return Boolean(
    env.STRIPE_PLAN_PRICES?.trim() &&
      env.DATAFORSEO_LOGIN &&
      env.DATAFORSEO_PASSWORD,
  )
}

const turnstileOn = (env: Env) =>
  Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET)

// The Turnstile site key for the sign-in pages, when Turnstile is set up.
export function turnstileSiteKey(env: Env): string | undefined {
  return turnstileOn(env) ? env.TURNSTILE_SITE_KEY : undefined
}

// Whether a sign-in form's Turnstile token passed, or undefined when
// Turnstile is not set up. A failure only flags the free credit; it never
// stops a sign-in. When Cloudflare cannot be reached the sign-in counts as
// passed, since the person cannot cause that.
export async function turnstilePassed(
  env: Env,
  request: Request,
  form: FormData | null,
): Promise<boolean | undefined> {
  if (!turnstileOn(env)) return undefined
  const token = form?.get('cf-turnstile-response')
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  const ip = request.headers.get('cf-connecting-ip')
  try {
    const response = await fetch(TURNSTILE_URL, {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return true
    const json = await readJson<{ success?: unknown }>(response, 'Turnstile', {
      maxBytes: 16_384,
    })
    return json.success === true
  } catch (error) {
    console.error('turnstile', String(error))
    return true
  }
}

// A salted hash: HMAC-SHA256 under a key derived from SEAL_KEY and a fixed
// label, so each kind of value has its own salt and no new secret is needed.
const hmacKeys = new Map<string, Promise<CryptoKey>>()
async function hmac(key: BufferSource, value: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value)),
  )
}

export async function saltedHash(
  env: Env,
  label: 'credit-sites' | 'credit-ips' | 'credit-cards',
  value: string,
): Promise<string> {
  const id = `${env.SEAL_KEY}\n${label}`
  let key = hmacKeys.get(id)
  if (!key) {
    key = hmac(new TextEncoder().encode(env.SEAL_KEY), label).then((salt) =>
      crypto.subtle.importKey(
        'raw',
        salt,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
    )
    hmacKeys.set(id, key)
  }
  const digest = await crypto.subtle.sign(
    'HMAC',
    await key,
    new TextEncoder().encode(value),
  )
  return toBase64Url(new Uint8Array(digest))
}

// The network block of an address: IPv4 /24, IPv6 /48, or null.
export function networkBlock(ip: string | null): string | null {
  const value = ip?.trim().toLowerCase()
  if (!value) return null
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`
  if (!value.includes(':') || !/^[0-9a-f:.]+$/.test(value)) return null
  const [head = '', tail] = value.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
  const first = groups.slice(0, 3)
  if (first.length < 3 || first.some((group) => !/^[0-9a-f]{1,4}$/.test(group)))
    return null
  return `${first.map((group) => Number.parseInt(group, 16).toString(16)).join(':')}::/48`
}

// The host a property is on: sc-domain:example.com and
// https://www.example.com/ are both example.com.
export function propertyHost(property: string): string | null {
  const value = property.trim().toLowerCase()
  try {
    const host = value.startsWith('sc-domain:')
      ? value.slice('sc-domain:'.length).replace(/\.$/, '')
      : new URL(value).hostname
    return host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

export const onFreeHost = (host: string) =>
  FREE_HOSTS.some((free) => host === free || host.endsWith(`.${free}`))

// Records a sign-in for the credit: whether it passed Turnstile and its
// hashed network block. Called from both Google sign-in callbacks. human
// is recorded as unchecked when Turnstile is not set up; one failed check
// stays recorded. Never throws.
export async function noteSignIn(
  env: Env,
  userId: string,
  request: Request,
  human: boolean,
): Promise<void> {
  if (!creditOn(env)) return
  try {
    const block = networkBlock(request.headers.get('cf-connecting-ip'))
    const ipHash = block ? await saltedHash(env, 'credit-ips', block) : null
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO credits (user_id, state, human, ip_hash, ip_at, updated_at)
       VALUES (?1, 'pending', ?2, ?3, ?4, ?4)
       ON CONFLICT (user_id) DO UPDATE SET
         human = CASE WHEN credits.human = 0 THEN 0 ELSE COALESCE(excluded.human, credits.human) END,
         ip_hash = COALESCE(excluded.ip_hash, credits.ip_hash),
         ip_at = CASE WHEN excluded.ip_hash IS NULL THEN credits.ip_at ELSE excluded.ip_at END,
         updated_at = excluded.updated_at`,
    )
      .bind(userId, turnstileOn(env) ? (human ? 1 : 0) : null, ipHash, now)
      .run()
  } catch (error) {
    console.error('credit sign-in', String(error))
  }
}

// Decides a pending credit once the account has a Search Console site:
// grants it, holds it for a card or a qualifying site, or refuses it for a
// group of sites that already had one. Safe to call often; does nothing
// once decided. Never throws.
export async function settleCredit(
  env: Env,
  userId: string,
  directory: LinkedAccounts,
): Promise<void> {
  if (!creditOn(env)) return
  try {
    await settle(env, userId, directory, Date.now())
  } catch (error) {
    console.error('credit settle', String(error))
  }
}

async function settle(
  env: Env,
  userId: string,
  directory: LinkedAccounts,
  now: number,
): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT state, human, ip_hash, checked_at FROM credits WHERE user_id = ?',
  )
    .bind(userId)
    .first<Row>()
  if (!row) {
    // An account from before the credit, or one that has not signed in
    // since: it gets a row with Turnstile unchecked.
    await env.DB.prepare(
      `INSERT INTO credits (user_id, state, updated_at) VALUES (?1, 'pending', ?2)
       ON CONFLICT (user_id) DO NOTHING`,
    )
      .bind(userId, now)
      .run()
  }
  const state = row?.state ?? 'pending'
  // Decided, or waiting for a card: nothing to do here.
  if (state === 'granted' || state === 'linked' || state === 'held_card') return
  if (state === 'held_cap') {
    await grant(env, userId, row?.ip_hash ?? null, now)
    return
  }
  const wait = state === 'held_site' ? RECHECK_SITE_MS : RECHECK_PENDING_MS
  if (row?.checked_at && now - row.checked_at < wait) return
  // Claimed first, so calls at the same moment do not all ask Google.
  const claimed = await env.DB.prepare(
    `UPDATE credits SET checked_at = ?2 WHERE user_id = ?1 AND state = ?3
       AND checked_at IS ?4`,
  )
    .bind(userId, now, state, row?.checked_at ?? null)
    .run()
  if (!claimed.meta.changes) return

  const sites = await sitesOf(directory)
  if (sites.length === 0) return

  // One credit per linked group: any site already recorded for another
  // account means this group had its chance.
  const hashes = [
    ...new Set(
      await Promise.all(
        [...new Set(sites.map((site) => site.host))].map((host) =>
          saltedHash(env, 'credit-sites', host),
        ),
      ),
    ),
  ].sort()
  if (await linkedElsewhere(env, userId, hashes)) {
    await setState(env, userId, 'linked', now)
    return
  }
  await env.DB.batch(
    hashes.map((hash) =>
      env.DB.prepare(
        'INSERT INTO credit_sites (hash, user_id, at) VALUES (?, ?, ?) ON CONFLICT (hash) DO NOTHING',
      ).bind(hash, userId, now),
    ),
  )
  // Another account may have recorded one of them a moment ago.
  if (await linkedElsewhere(env, userId, hashes)) {
    await setState(env, userId, 'linked', now)
    return
  }

  if (!(await hasRealSite(sites, now))) {
    await setState(env, userId, 'held_site', now)
    return
  }

  const failedTurnstile = row?.human === 0
  const busyNetwork = row?.ip_hash
    ? ((
        await env.DB.prepare(
          'SELECT count FROM credit_ips WHERE ip_hash = ? AND week = ?',
        )
          .bind(row.ip_hash, isoWeek(new Date(now)))
          .first<{ count: number }>()
      )?.count ?? 0) >= IP_WEEKLY_LIMIT
    : false
  if (failedTurnstile || busyNetwork) {
    await setState(env, userId, 'held_card', now)
    return
  }
  await grant(env, userId, row?.ip_hash ?? null, now)
}

type Site = {
  property: string
  host: string
  google: ReturnType<LinkedAccounts['accounts']>[number]['google']
}

// Every property each linked Google account can read, sorted, at most
// MAX_SITES. A sign-in that cannot list its properties adds none.
async function sitesOf(directory: LinkedAccounts): Promise<Site[]> {
  const lists = await Promise.all(
    directory.accounts().map(async (account) =>
      (
        await readableSites(account.google, '').catch(
          () => [] as { siteUrl: string }[],
        )
      ).flatMap((site) => {
        const host = propertyHost(site.siteUrl)
        return host
          ? [{ property: site.siteUrl, host, google: account.google }]
          : []
      }),
    ),
  )
  return lists
    .flat()
    .sort(
      (a, b) =>
        a.property.localeCompare(b.property) || a.host.localeCompare(b.host),
    )
    .slice(0, MAX_SITES)
}

async function linkedElsewhere(
  env: Env,
  userId: string,
  hashes: string[],
): Promise<boolean> {
  // D1 binds at most 100 values a statement.
  for (let start = 0; start < hashes.length; start += 99) {
    const part = hashes.slice(start, start + 99)
    const found = await env.DB.prepare(
      `SELECT 1 AS hit FROM credit_sites
       WHERE hash IN (${part.map((_, i) => `?${i + 2}`).join(', ')})
         AND user_id IS NOT ?1 LIMIT 1`,
    )
      .bind(userId, ...part)
      .first<{ hit: number }>()
    if (found) return true
  }
  return false
}

// At least one property on its own domain (not a free host) with Search
// Console impressions in the last 90 days of final data. At most
// MAX_IMPRESSION_CHECKS properties are asked, one query each.
async function hasRealSite(sites: Site[], now: number): Promise<boolean> {
  const range = finalGscDateRange(IMPRESSION_DAYS, new Date(now))
  const own = sites.filter((site) => !onFreeHost(site.host))
  for (const site of own.slice(0, MAX_IMPRESSION_CHECKS)) {
    const result = await searchAnalyticsRows(
      site.google,
      site.property,
      { ...range, dimensions: [], rowLimit: 1, maxRows: 1 },
      { signIn: '' },
    ).catch(() => null)
    if ((result?.rows[0]?.impressions ?? 0) > 0) return true
  }
  return false
}

async function setState(
  env: Env,
  userId: string,
  state: State,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE credits SET state = ?2, updated_at = ?3
     WHERE user_id = ?1 AND state NOT IN ('granted', 'linked')`,
  )
    .bind(userId, state, now)
    .run()
}

const utcDayStart = (at: number) => at - (at % DAY_MS)

// Grants the credit when today's cap allows, in one conditional UPDATE so
// two calls cannot both grant it or pass the cap; otherwise holds it for
// the cap and tells Ian once that day.
async function grant(
  env: Env,
  userId: string,
  ipHash: string | null,
  now: number,
): Promise<void> {
  const granted = await env.DB.prepare(
    `UPDATE credits SET state = 'granted', granted_at = ?2, updated_at = ?2
     WHERE user_id = ?1 AND state NOT IN ('granted', 'linked')
       AND (SELECT COUNT(*) FROM credits WHERE granted_at >= ?3) < ?4`,
  )
    .bind(userId, now, utcDayStart(now), DAILY_CAP)
    .run()
  if (granted.meta.changes) {
    await addFreeCredit(env, userId)
    if (ipHash) {
      await env.DB.prepare(
        `INSERT INTO credit_ips (ip_hash, week, count) VALUES (?1, ?2, 1)
         ON CONFLICT (ip_hash, week) DO UPDATE SET count = credit_ips.count + 1`,
      )
        .bind(ipHash, isoWeek(new Date(now)))
        .run()
    }
    return
  }
  const held = await env.DB.prepare(
    `UPDATE credits SET state = 'held_cap', updated_at = ?2
     WHERE user_id = ?1 AND state NOT IN ('granted', 'linked', 'held_cap')`,
  )
    .bind(userId, now)
    .run()
  if (held.meta.changes) await capAlert(env, now)
}

// One Telegram message a UTC day when the cap is reached, claimed first in
// cost_alerts (as cost-report.ts does) and let go when Telegram fails.
async function capAlert(env: Env, now: number): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return
  const day = new Date(now).toISOString().slice(0, 10)
  const claimed = await env.DB.prepare(
    `INSERT INTO cost_alerts (kind, day, sent_at) VALUES ('credit_cap', ?, ?)
     ON CONFLICT DO NOTHING`,
  )
    .bind(day, now)
    .run()
  if (!claimed.meta.changes) return
  try {
    await sendTelegram(
      env,
      async () =>
        `SEO Skill free credits reached today's cap of ${DAILY_CAP} (${day} UTC). Later ones wait for the next day.`,
    )
  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM cost_alerts WHERE kind = 'credit_cap' AND day = ?",
    )
      .bind(day)
      .run()
    console.error('credit cap alert', String(error))
  }
}

// The hourly cron: forgets network block hashes older than 30 days.
export async function forgetCreditIps(env: Env, at: number): Promise<void> {
  const before = at - IP_KEEP_MS
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE credits SET ip_hash = NULL, ip_at = NULL WHERE ip_at < ?',
    ).bind(before),
    env.DB.prepare('DELETE FROM credit_ips WHERE week < ?').bind(
      isoWeek(new Date(before)),
    ),
  ])
}

// A Stripe Checkout page in setup mode that saves a card without charging
// it, to unlock a credit held for a card.
export async function creditCardCheckout(
  env: Env,
  userId: string,
): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT c.state, b.customer FROM credits c
     LEFT JOIN billing b ON b.user_id = c.user_id WHERE c.user_id = ?`,
  )
    .bind(userId)
    .first<{ state: State; customer: string | null }>()
  if (row?.state !== 'held_card') {
    throw new Error('This account has no free credit waiting for a card.')
  }
  let customer = row.customer
  if (!customer) {
    const created = await stripe<{ id: string }>(env, 'POST', 'customers', {
      'metadata[user_id]': userId,
    })
    await env.DB.prepare(
      `INSERT INTO billing (user_id, customer, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET
         customer = COALESCE(billing.customer, excluded.customer)`,
    )
      .bind(userId, created.id, Date.now())
      .run()
    customer =
      (
        await env.DB.prepare('SELECT customer FROM billing WHERE user_id = ?')
          .bind(userId)
          .first<{ customer: string | null }>()
      )?.customer ?? created.id
  }
  const home = accountUrl(env)
  const session = await stripe<{ url: string | null }>(
    env,
    'POST',
    'checkout/sessions',
    {
      mode: 'setup',
      customer,
      'payment_method_types[0]': 'card',
      client_reference_id: userId,
      'metadata[purpose]': 'credit',
      'metadata[user_id]': userId,
      'setup_intent_data[metadata][purpose]': 'credit',
      'setup_intent_data[metadata][user_id]': userId,
      success_url: `${home}#plan`,
      cancel_url: `${home}#plan`,
    },
  )
  if (!session.url) throw new Error('Stripe sent no Checkout page.')
  return session.url
}

type SetupIntent = {
  status?: string
  metadata?: { purpose?: string; user_id?: string }
  payment_method?: { card?: { fingerprint?: string } } | string | null
}

// Stripe's webhook calls this when a credit Checkout in setup mode
// finished: one credit per card. The card's fingerprint is kept only as a
// salted hash.
export async function unlockCreditWithCard(
  env: Env,
  userId: string,
  setupIntent: string,
): Promise<void> {
  if (!/^seti_\w+$/.test(setupIntent)) return
  const intent = await stripe<SetupIntent>(
    env,
    'GET',
    `setup_intents/${setupIntent}`,
    { 'expand[]': 'payment_method' },
  )
  if (
    intent.status !== 'succeeded' ||
    intent.metadata?.purpose !== 'credit' ||
    intent.metadata.user_id !== userId
  ) {
    return
  }
  const fingerprint =
    typeof intent.payment_method === 'object'
      ? intent.payment_method?.card?.fingerprint
      : undefined
  if (!fingerprint) return
  await unlockWithFingerprint(env, userId, fingerprint, Date.now())
}

// The decision once Stripe sent the card's fingerprint.
export async function unlockWithFingerprint(
  env: Env,
  userId: string,
  fingerprint: string,
  now: number,
): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT state, ip_hash FROM credits WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ state: State; ip_hash: string | null }>()
  if (row?.state !== 'held_card') return
  const hash = await saltedHash(env, 'credit-cards', fingerprint)
  await env.DB.prepare(
    'INSERT INTO credit_cards (hash, user_id, at) VALUES (?, ?, ?) ON CONFLICT (hash) DO NOTHING',
  )
    .bind(hash, userId, now)
    .run()
  const owner = await env.DB.prepare(
    'SELECT user_id FROM credit_cards WHERE hash = ?',
  )
    .bind(hash)
    .first<{ user_id: string | null }>()
  // This card already unlocked a credit for another account.
  if (owner?.user_id !== userId) return
  await grant(env, userId, row.ip_hash, now)
}
