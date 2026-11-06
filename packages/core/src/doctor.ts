import { existsSync } from 'node:fs'
import { CLOUD_URL, cloudGoogleEmails, cloudLinked } from './cloud.js'
import {
  getAuthModeStatus,
  getClientConfig,
  getServiceAccountStatus,
} from './gsc/auth.js'
import { getSeoCliPaths } from './paths.js'
import { readOauthClient, readTokens } from './storage/config.js'
import { checkDatabaseReadiness } from './storage/database.js'

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

type DoctorDependencies = {
  checkDatabase?: typeof checkDatabaseReadiness
}

export async function runDoctor(
  dependencies: DoctorDependencies = {},
): Promise<{
  ok: boolean
  generatedAt: string
  checks: DoctorCheck[]
}> {
  const paths = getSeoCliPaths()
  const authMode = getAuthModeStatus()
  const serviceAccount = getServiceAccountStatus()
  const tokens = await readTokens()
  const oauthClient = readOauthClient()
  const tokenClientConfigured = tokens
    ? Boolean(getClientConfig(tokens.client_source))
    : undefined
  const checks: DoctorCheck[] = []

  try {
    const database = (dependencies.checkDatabase ?? checkDatabaseReadiness)()
    checks.push({
      id: 'local-database',
      label: 'Local database',
      status: 'pass',
      detail: database.dbPath,
    })
  } catch (error) {
    checks.push({
      id: 'local-database',
      label: 'Local database',
      status: 'fail',
      detail:
        error instanceof Error
          ? error.message
          : 'The local database could not be opened.',
      fix: 'Upgrade or reinstall `seo`. If this still fails, report it at https://github.com/iannuttall/seo/issues.',
    })
  }

  checks.push({
    id: 'config-dir',
    label: 'Config directory',
    status: existsSync(paths.configDir) ? 'pass' : 'warn',
    detail: paths.configDir,
    fix: existsSync(paths.configDir)
      ? undefined
      : 'Run `seo start` or `seo auth setup-client`.',
  })

  // A machine linked to a seoskill.dev account (`seo login` or SEO_TOKEN)
  // gets its Google sign-ins from the account, so no local client, token or
  // scopes are needed. Check the account answers instead.
  if (cloudLinked() && !serviceAccount.configured) {
    checks.push(await accountCheck())
    const ok = checks.every((check) => check.status !== 'fail')
    return { ok, generatedAt: new Date().toISOString(), checks }
  }

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
      label: scope.endsWith('webmasters.readonly')
        ? 'Search Console scope'
        : 'Google Analytics scope',
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

  const ok = checks.every((check) => check.status !== 'fail')
  return {
    ok,
    generatedAt: new Date().toISOString(),
    checks,
  }
}

// The seoskill.dev account link and the Google sign-ins it holds.
async function accountCheck(): Promise<DoctorCheck> {
  const via = process.env.SEO_TOKEN?.trim() ? 'SEO_TOKEN' : '`seo login`'
  try {
    const emails = await cloudGoogleEmails()
    return emails.length
      ? {
          id: 'google-login',
          label: 'Google login',
          status: 'pass',
          detail: `Linked to a ${CLOUD_URL} account through ${via}, with Google sign-ins for ${emails.join(', ')}. The local Google client, token and scopes are not used.`,
        }
      : {
          id: 'google-login',
          label: 'Google login',
          status: 'fail',
          detail: `Linked to a ${CLOUD_URL} account through ${via}, but the account has no Google sign-in.`,
          fix: `Connect Google at ${CLOUD_URL}/account, then run \`seo doctor\` again.`,
        }
  } catch (error) {
    return {
      id: 'google-login',
      label: 'Google login',
      status: 'fail',
      detail: `Linked to a ${CLOUD_URL} account through ${via}, but the account could not be read: ${error instanceof Error ? error.message : String(error)}`,
      fix:
        via === 'SEO_TOKEN'
          ? `Make a new token at ${CLOUD_URL}/account and set SEO_TOKEN again.`
          : 'Run `seo login` again.',
    }
  }
}
