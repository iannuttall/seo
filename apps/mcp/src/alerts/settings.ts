import { betaFlags } from '../beta.ts'
import { seal, toBase64Url, unseal } from '../seal.ts'
import { ALERTS, type AlertTypeId, type Channel } from './registry.ts'

// What each person wants: every alert type on or off for email and for the
// webhook, and the webhook URL with its signing secret.

export type AlertSettings = {
  // Only the types the account may get, each with both channels resolved.
  types: { id: AlertTypeId; email: boolean; webhook: boolean }[]
  webhookUrl: string | null
  webhookSecret: string | null
  webhookLast: { at: number; result: string } | null
}

type Prefs = Partial<Record<string, Partial<Record<Channel, boolean>>>>

type Row = {
  prefs: string
  webhook_url: string | null
  webhook_secret: string | null
  webhook_last_at: number | null
  webhook_last: string | null
}

async function row(env: Env, userId: string): Promise<Row | null> {
  return env.DB.prepare(
    'SELECT prefs, webhook_url, webhook_secret, webhook_last_at, webhook_last FROM alert_settings WHERE user_id = ?',
  )
    .bind(userId)
    .first<Row>()
}

export async function alertSettings(
  env: Env,
  userId: string,
): Promise<AlertSettings> {
  const [saved, flags] = await Promise.all([
    row(env, userId),
    betaFlags(env, userId),
  ])
  const prefs = JSON.parse(saved?.prefs ?? '{}') as Prefs
  const types = (Object.keys(ALERTS) as AlertTypeId[])
    .filter((id) => flags.has(ALERTS[id].flag))
    .sort()
    .map((id) => ({
      id,
      email: prefs[id]?.email ?? ALERTS[id].defaults.email,
      webhook: prefs[id]?.webhook ?? ALERTS[id].defaults.webhook,
    }))
  return {
    types,
    webhookUrl: saved?.webhook_url ?? null,
    webhookSecret: saved?.webhook_secret
      ? ((await unseal(env.SEAL_KEY, saved.webhook_secret, 'secret'))?.value ??
        null)
      : null,
    webhookLast:
      saved?.webhook_last_at && saved.webhook_last
        ? { at: saved.webhook_last_at, result: saved.webhook_last }
        : null,
  }
}

// Saves the switches for the given types (the ones the form showed), and
// the webhook URL. A first URL gets a new signing secret.
export async function saveAlertSettings(
  env: Env,
  userId: string,
  input: {
    types: { id: AlertTypeId; email: boolean; webhook: boolean }[]
    webhookUrl: string | null
  },
): Promise<void> {
  const saved = await row(env, userId)
  const prefs = JSON.parse(saved?.prefs ?? '{}') as Prefs
  for (const item of input.types) {
    prefs[item.id] = { email: item.email, webhook: item.webhook }
  }
  const secret =
    saved?.webhook_secret ?? (input.webhookUrl ? await newSecret(env) : null)
  await env.DB.prepare(
    `INSERT INTO alert_settings (user_id, prefs, webhook_url, webhook_secret, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET prefs = excluded.prefs,
       webhook_url = excluded.webhook_url, webhook_secret = excluded.webhook_secret,
       webhook_last_at = CASE WHEN alert_settings.webhook_url IS excluded.webhook_url
         THEN alert_settings.webhook_last_at END,
       webhook_last = CASE WHEN alert_settings.webhook_url IS excluded.webhook_url
         THEN alert_settings.webhook_last END,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(prefs), input.webhookUrl, secret, Date.now())
    .run()
}

// One channel of one type off, from the link in an alert email.
export async function turnOff(
  env: Env,
  userId: string,
  type: AlertTypeId,
  channel: Channel,
): Promise<void> {
  const saved = await row(env, userId)
  const prefs = JSON.parse(saved?.prefs ?? '{}') as Prefs
  prefs[type] = { ...prefs[type], [channel]: false }
  await env.DB.prepare(
    `INSERT INTO alert_settings (user_id, prefs, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(prefs), Date.now())
    .run()
}

// A new signing secret: receivers who check signatures must update theirs.
export async function rotateSecret(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE alert_settings SET webhook_secret = ?, updated_at = ? WHERE user_id = ? AND webhook_url IS NOT NULL',
  )
    .bind(await newSecret(env), Date.now(), userId)
    .run()
}

export async function recordWebhook(
  env: Env,
  userId: string,
  result: string,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE alert_settings SET webhook_last_at = ?, webhook_last = ? WHERE user_id = ?',
  )
    .bind(Date.now(), result.slice(0, 200), userId)
    .run()
}

// Standard Webhooks secret format: whsec_ and 32 random bytes, base64.
async function newSecret(env: Env): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base64 = toBase64Url(bytes).replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return seal(env.SEAL_KEY, { k: 'secret', value: `whsec_${padded}` })
}

// Why a webhook URL cannot be used, or null. Checked when it is saved and
// again before each delivery. The Worker's fetch also refuses private
// addresses after DNS (global_fetch_strictly_public), and deliveries never
// follow redirects.
export function webhookUrlProblem(value: string): string | null {
  if (value.length > 2000) return 'That webhook URL is too long.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'That webhook URL is not a URL.'
  }
  if (url.protocol !== 'https:') return 'Use an https:// webhook URL.'
  if (url.username || url.password) {
    return 'Leave the user name and password out of the webhook URL.'
  }
  if (privateHost(url.hostname.toLowerCase())) {
    return 'Use a webhook URL on a public host name.'
  }
  return null
}

function privateHost(host: string): boolean {
  if (
    !host.includes('.') ||
    host.startsWith('[') ||
    /(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)
  ) {
    return true
  }
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!v4) return false
  const a = Number(v4[1])
  const b = Number(v4[2])
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  )
}
