import { existsSync } from 'node:fs'
import { getAuthModeStatus } from './gsc/auth.js'
import { getSeoCliPaths } from './paths.js'
import { readConfig, readOauthClient, readTokens } from './storage/config.js'

export type DoctorCheck = {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  fix?: string
}

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
]

export async function runDoctor(): Promise<{
  ok: boolean
  generatedAt: string
  checks: DoctorCheck[]
}> {
  const paths = getSeoCliPaths()
  const config = readConfig()
  const authMode = getAuthModeStatus()
  const tokens = await readTokens()
  const oauthClient = readOauthClient()
  const checks: DoctorCheck[] = []

  checks.push({
    id: 'config-dir',
    label: 'Config directory',
    status: existsSync(paths.configDir) ? 'pass' : 'warn',
    detail: paths.configDir,
    fix: existsSync(paths.configDir)
      ? undefined
      : 'Run `seo init` or `seo auth setup-client`.',
  })

  checks.push({
    id: 'oauth-client',
    label: 'OAuth client',
    status:
      authMode.sharedConfigured || authMode.byoConfigured ? 'pass' : 'fail',
    detail: authMode.sharedConfigured
      ? 'Shared client configured.'
      : authMode.byoConfigured
        ? `BYO client configured at ${paths.oauthClientFile}.`
        : 'No shared or BYO Google OAuth client configured.',
    fix:
      authMode.sharedConfigured || authMode.byoConfigured
        ? undefined
        : 'Run `seo auth setup-client` or set SEO_GOOGLE_CLIENT_ID and SEO_GOOGLE_CLIENT_SECRET.',
  })

  checks.push({
    id: 'oauth-client-file',
    label: 'BYO OAuth file',
    status: oauthClient ? 'pass' : 'warn',
    detail: oauthClient
      ? paths.oauthClientFile
      : 'No BYO OAuth client file. This is fine if using a shared client.',
  })

  checks.push({
    id: 'google-login',
    label: 'Google login',
    status: tokens ? 'pass' : 'fail',
    detail: tokens
      ? `Signed in as ${tokens.account_email}.`
      : 'No Google token found.',
    fix: tokens ? undefined : 'Run `seo auth login`.',
  })

  const grantedScopes = new Set(
    tokens?.scope.split(/\s+/).filter(Boolean) ?? [],
  )
  for (const scope of REQUIRED_SCOPES) {
    checks.push({
      id: `scope:${scope}`,
      label: scope.endsWith('webmasters.readonly') ? 'GSC scope' : 'GA4 scope',
      status:
        tokens && grantedScopes.has(scope) ? 'pass' : tokens ? 'fail' : 'warn',
      detail: tokens
        ? grantedScopes.has(scope)
          ? scope
          : `Missing ${scope}.`
        : 'Cannot inspect scopes until login is complete.',
      fix:
        tokens && !grantedScopes.has(scope)
          ? 'Run `seo auth logout` then `seo auth login`.'
          : undefined,
    })
  }

  checks.push({
    id: 'default-site',
    label: 'Default GSC property',
    status: config.defaultSite ? 'pass' : 'warn',
    detail: config.defaultSite ?? 'No default property configured.',
    fix: config.defaultSite
      ? undefined
      : 'Run `seo init` or pass --site to commands.',
  })

  checks.push({
    id: 'default-ga4',
    label: 'Default GA4 property',
    status: config.google.defaultGa4PropertyId ? 'pass' : 'warn',
    detail:
      config.google.defaultGa4PropertyId ??
      'No default GA4 property configured.',
    fix: config.google.defaultGa4PropertyId
      ? undefined
      : 'Run `seo ga4-properties` and save a mapping during init.',
  })

  const ok = checks.every((check) => check.status !== 'fail')
  return {
    ok,
    generatedAt: new Date().toISOString(),
    checks,
  }
}
