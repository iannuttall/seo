import { existsSync } from 'node:fs'
import {
  getAuthModeStatus,
  getClientConfig,
  getServiceAccountStatus,
} from './gsc/auth.js'
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
  const serviceAccount = getServiceAccountStatus()
  const tokens = await readTokens()
  const oauthClient = readOauthClient()
  const tokenClientConfigured = tokens
    ? Boolean(getClientConfig(tokens.client_source))
    : undefined
  const checks: DoctorCheck[] = []

  checks.push({
    id: 'config-dir',
    label: 'Config directory',
    status: existsSync(paths.configDir) ? 'pass' : 'warn',
    detail: paths.configDir,
    fix: existsSync(paths.configDir)
      ? undefined
      : 'Run `seo start` or `seo auth setup-client`.',
  })

  checks.push({
    id: 'oauth-client',
    label: 'Google credentials',
    status: serviceAccount.configured
      ? 'pass'
      : tokenClientConfigured === false
        ? 'fail'
        : serviceAccount.error
          ? 'fail'
          : authMode.sharedConfigured || authMode.byoConfigured
            ? 'pass'
            : 'fail',
    detail: serviceAccount.configured
      ? `Service account configured for ${serviceAccount.identity}.`
      : tokenClientConfigured === false
        ? `Stored Google login uses the ${tokens?.client_source === 'shared' ? 'shared seo app' : 'BYO client'}, but that client is not configured.`
        : serviceAccount.error
          ? serviceAccount.error
          : authMode.sharedConfigured
            ? 'Shared client configured.'
            : authMode.byoConfigured
              ? `BYO client configured at ${paths.oauthClientFile}.`
              : 'No shared or BYO Google OAuth client configured.',
    fix: serviceAccount.configured
      ? undefined
      : tokenClientConfigured === false
        ? tokens?.client_source === 'shared'
          ? 'Reinstall `seo`. If the shared client is still missing, report it at https://github.com/iannuttall/seo/issues.'
          : 'Restore the same client with `seo auth setup-client`, or run `seo auth logout` before signing in with a different client.'
        : serviceAccount.error
          ? 'Set one valid service account credential source, then run `seo doctor` again.'
          : authMode.sharedConfigured || authMode.byoConfigured
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
    status: serviceAccount.configured || tokens ? 'pass' : 'fail',
    detail: serviceAccount.configured
      ? `Using service account ${serviceAccount.identity}.`
      : tokens
        ? `Signed in as ${tokens.account_email}.`
        : 'No Google token found.',
    fix:
      serviceAccount.configured || tokens
        ? undefined
        : 'Run `seo auth login`, or configure a service account for CI.',
  })

  const grantedScopes = new Set(
    tokens?.scope.split(/\s+/).filter(Boolean) ?? [],
  )
  for (const scope of REQUIRED_SCOPES) {
    checks.push({
      id: `scope:${scope}`,
      label: scope.endsWith('webmasters.readonly') ? 'GSC scope' : 'GA4 scope',
      status:
        serviceAccount.configured || (tokens && grantedScopes.has(scope))
          ? 'pass'
          : tokens
            ? 'fail'
            : 'warn',
      detail: serviceAccount.configured
        ? `${scope} requested by the service account.`
        : tokens
          ? grantedScopes.has(scope)
            ? scope
            : `Missing ${scope}.`
          : 'Cannot inspect scopes until login is complete.',
      fix:
        !serviceAccount.configured && tokens && !grantedScopes.has(scope)
          ? 'Run `seo auth logout` then `seo auth login`.'
          : undefined,
    })
  }

  checks.push({
    id: 'default-site',
    label: 'Saved GSC property',
    status: 'pass',
    detail:
      config.defaultSite ??
      'No saved default. Human CLI commands will prompt; agents can pass --site.',
  })

  checks.push({
    id: 'default-ga4',
    label: 'Saved GA4 property',
    status: 'pass',
    detail:
      config.google.defaultGa4PropertyId ??
      'No saved default. Human CLI commands will prompt; agents can pass --property.',
  })

  const ok = checks.every((check) => check.status !== 'fail')
  return {
    ok,
    generatedAt: new Date().toISOString(),
    checks,
  }
}
