import { intro, note, outro, password, text } from '@clack/prompts'
import {
  authStatus,
  deleteTokens,
  formatRelativeExpiry,
  getSeoCliPaths,
  getTokenStorageStatus,
  loginWithLoopback,
  refreshAuthToken,
  SeoError,
  setTokenStorageMode,
  writeOauthClient,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
} from '../utils.js'

function serviceAccountSource(source?: string): string {
  if (!source) return 'invalid or conflicting configuration'
  if (source === 'environment-json') {
    return 'SEO_GOOGLE_SERVICE_ACCOUNT_JSON'
  }
  if (source === 'environment-file') {
    return 'SEO_GOOGLE_SERVICE_ACCOUNT_FILE'
  }
  return 'GOOGLE_APPLICATION_CREDENTIALS'
}

function tokenStorageLabel(input: {
  configured: 'keychain' | 'file'
  active: 'keychain' | 'file'
  reason?: string
}): string {
  if (input.active === 'keychain') return 'system keychain'
  return input.configured === 'keychain'
    ? 'private file fallback'
    : 'private file'
}

export const authCommand = defineCommand({
  meta: {
    name: 'auth',
    description: 'Authentication commands',
  },
  subCommands: {
    login: defineCommand({
      meta: { name: 'login', description: 'Run Google OAuth flow' },
      run: async () => {
        const status = await authStatus()
        if (status.activeMode === 'service-account') {
          throw new SeoError(
            'AUTH_CONFIG_REQUIRED',
            'A service account is active from the environment. Unset its credential variable before running browser OAuth.',
          )
        }
        const tokens = await loginWithLoopback()
        process.stdout.write(
          `${tokens.account_email} · ${tokens.scope.replace('https://www.googleapis.com/auth/', '')} · ${tokens.client_source === 'shared' ? 'shared seo app' : 'BYO client'}\n`,
        )
      },
    }),
    logout: defineCommand({
      meta: { name: 'logout', description: 'Delete locally stored tokens' },
      run: async () => {
        const status = await authStatus()
        await deleteTokens()
        if (status.activeMode === 'service-account') {
          process.stdout.write(
            'Deleted local OAuth tokens. Service account credentials remain available through the environment.\n',
          )
          return
        }
        process.stdout.write(
          'Deleted local OAuth tokens.\nRevoke at https://myaccount.google.com/permissions if you also want Google to forget the grant.\n',
        )
      },
    }),
    whoami: defineCommand({
      meta: {
        name: 'whoami',
        description: 'Show the signed-in Google account',
      },
      run: async () => {
        const status = await authStatus()
        if (status.activeMode === 'service-account') {
          process.stdout.write(
            'service account · ' +
              (status.identity ?? 'invalid configuration') +
              ' · ' +
              serviceAccountSource(status.serviceAccount.source) +
              '\n',
          )
          return
        }
        const tokens = status.tokens
        if (!tokens) {
          process.stdout.write('Not logged in.\n')
          return
        }
        process.stdout.write(
          `${tokens.account_email} · ${tokens.scope.replace('https://www.googleapis.com/auth/', '')} · ${formatRelativeExpiry(tokens.expires_at)} · ${tokens.client_source === 'shared' ? 'shared seo app' : 'BYO client'}\n`,
        )
      },
    }),
    status: defineCommand({
      meta: {
        name: 'status',
        description: 'Show local Google auth status',
      },
      args: {
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const status = await authStatus()
        const storage =
          status.activeMode === 'oauth'
            ? await getTokenStorageStatus()
            : undefined
        if (jsonFlag(args)) {
          printJson({
            authenticated:
              status.activeMode === 'oauth'
                ? Boolean(status.tokens)
                : status.serviceAccount.configured,
            mode: status.activeMode,
            identity: status.identity,
            account:
              status.activeMode === 'oauth'
                ? status.tokens?.account_email
                : undefined,
            scopes:
              status.activeMode === 'oauth' ? status.tokens?.scope : undefined,
            clientSource:
              status.activeMode === 'oauth'
                ? status.tokens?.client_source
                : undefined,
            expiresAt:
              status.activeMode === 'oauth'
                ? status.tokens?.expires_at
                : undefined,
            sharedConfigured: status.sharedConfigured,
            byoConfigured: status.byoConfigured,
            serviceAccount: {
              configured: status.serviceAccount.configured,
              identity: status.serviceAccount.identity,
              source: status.serviceAccount.source,
              error: status.serviceAccount.error,
            },
            ...(storage ? { tokenStorage: storage } : {}),
          })
          return
        }
        if (status.activeMode === 'service-account') {
          const rows: Array<[string, string]> = [
            ['Mode', 'service account'],
            ['Identity', status.identity ?? 'unavailable'],
            ['Source', serviceAccountSource(status.serviceAccount.source)],
            ['Scopes', 'Search Console readonly, GA4 readonly'],
            ['Storage', 'credentials stay in the environment'],
          ]
          if (status.serviceAccount.error) {
            rows.push(['Status', status.serviceAccount.error])
          }
          printKeyValue(rows)
          return
        }
        if (!status.tokens) {
          const authMode = status.serviceAccount.error
            ? status.serviceAccount.error
            : status.sharedConfigured
              ? 'Shared seo app available'
              : status.byoConfigured
                ? 'BYO client configured'
                : 'No OAuth client configured'
          process.stdout.write(
            `Not logged in. ${authMode}. Run \`seo auth login\` to connect Google.\n`,
          )
          return
        }
        const tokenStorage = storage ?? (await getTokenStorageStatus())
        printKeyValue([
          ['Account', status.tokens.account_email],
          ['Scopes', status.tokens.scope],
          [
            'Client',
            status.tokens.client_source === 'shared'
              ? 'shared seo app'
              : 'BYO client',
          ],
          ['Expires', formatRelativeExpiry(status.tokens.expires_at)],
          ['Tokens file', getSeoCliPaths().tokensFile],
          ['Token storage', tokenStorageLabel(tokenStorage)],
          ...(tokenStorage.reason
            ? [['Storage note', tokenStorage.reason] as [string, string]]
            : []),
          [
            'OAuth mode',
            status.sharedConfigured
              ? 'shared app available'
              : status.byoConfigured
                ? 'BYO client configured'
                : 'missing',
          ],
          ['Revoke at', 'https://myaccount.google.com/permissions'],
        ])
      },
    }),
    storage: defineCommand({
      meta: {
        name: 'storage',
        description: 'Show or change local OAuth token storage',
      },
      args: {
        keychain: {
          type: 'boolean',
          default: false,
          description:
            'Store OAuth tokens in the system keychain when available.',
        },
        file: {
          type: 'boolean',
          default: false,
          description: 'Store OAuth tokens in the private local file.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        if (args.keychain && args.file) {
          throw new SeoError(
            'INVALID_INPUT',
            'Choose either --keychain or --file, not both.',
          )
        }
        const storage =
          args.keychain || args.file
            ? await setTokenStorageMode(args.keychain ? 'keychain' : 'file')
            : await getTokenStorageStatus()

        if (jsonFlag(args)) {
          printJson(storage)
          return
        }

        printKeyValue([
          ['Configured storage', storage.configured],
          ['Active storage', tokenStorageLabel(storage)],
          ...(storage.reason
            ? [['Note', storage.reason] as [string, string]]
            : []),
        ])
      },
    }),
    refresh: defineCommand({
      meta: {
        name: 'refresh',
        description: 'Refresh the Google OAuth token',
      },
      run: async () => {
        const status = await authStatus()
        if (status.activeMode === 'service-account') {
          process.stdout.write(
            'Service accounts request short-lived Google tokens automatically. No local refresh token is stored.\n',
          )
          return
        }
        const tokens = await refreshAuthToken()
        process.stdout.write(
          `Refreshed. New expiry ${new Date(tokens.expires_at).toISOString()}.\n`,
        )
      },
    }),
    'setup-client': defineCommand({
      meta: {
        name: 'setup-client',
        description: 'Save your own Google Desktop OAuth client',
      },
      args: {
        json: {
          type: 'boolean',
          default: false,
          description: 'Return a structured error instead of prompting.',
        },
      },
      run: async ({ args }) => {
        if (!canPrompt({ json: jsonFlag(args) })) {
          throw new SeoError(
            'INVALID_INPUT',
            '`seo auth setup-client` needs an interactive terminal. Run it without --json, or set SEO_GOOGLE_CLIENT_ID and SEO_GOOGLE_CLIENT_SECRET.',
          )
        }
        intro('seo BYO OAuth client')
        note(
          [
            'This is the advanced path.',
            'Most users should use the shared seo Google app.',
            'Your actual sensitive data is the local refresh token, not the desktop app client secret.',
          ].join('\n'),
          'Advanced',
        )
        const clientId = maybeExitCancelled(
          await text({
            message: 'Google Desktop OAuth client ID',
            validate: (value) => (value ? undefined : 'Client ID is required'),
          }),
        )
        const clientSecret = maybeExitCancelled(
          await password({
            message: 'Google Desktop OAuth client secret',
            validate: (value) =>
              value ? undefined : 'Client secret is required',
          }),
        )
        writeOauthClient({ clientId, clientSecret })
        outro(`Saved BYO OAuth client to ${getSeoCliPaths().oauthClientFile}`)
      },
    }),
  },
})
