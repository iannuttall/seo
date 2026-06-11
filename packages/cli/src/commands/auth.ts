import { intro, note, outro, password, text } from '@clack/prompts'
import {
  authStatus,
  deleteTokens,
  formatRelativeExpiry,
  getSeoCliPaths,
  loginWithLoopback,
  readTokens,
  refreshAuthToken,
  writeOauthClient,
} from '@seo/core'
import { defineCommand } from 'citty'
import { maybeExitCancelled, printKeyValue } from '../utils.js'

export const authCommand = defineCommand({
  meta: {
    name: 'auth',
    description: 'Authentication commands',
  },
  subCommands: {
    login: defineCommand({
      meta: { name: 'login', description: 'Run Google OAuth flow' },
      run: async () => {
        const tokens = await loginWithLoopback()
        process.stdout.write(
          `${tokens.account_email} · ${tokens.scope.replace('https://www.googleapis.com/auth/', '')} · ${tokens.client_source === 'shared' ? 'shared seo app' : 'BYO client'}\n`,
        )
      },
    }),
    logout: defineCommand({
      meta: { name: 'logout', description: 'Delete local token file' },
      run: async () => {
        await deleteTokens()
        process.stdout.write(
          'Deleted local tokens.\nRevoke at https://myaccount.google.com/permissions if you also want Google to forget the grant.\n',
        )
      },
    }),
    whoami: defineCommand({
      meta: {
        name: 'whoami',
        description: 'Show the signed-in Google account',
      },
      run: async () => {
        const tokens = await readTokens()
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
      run: async () => {
        const status = await authStatus()
        if (!status.tokens) {
          const authMode = status.sharedConfigured
            ? 'Shared seo app available'
            : status.byoConfigured
              ? 'BYO client configured'
              : 'No OAuth client configured'
          process.stdout.write(`Not logged in. ${authMode}.\n`)
          return
        }
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
    refresh: defineCommand({
      meta: {
        name: 'refresh',
        description: 'Refresh the Google OAuth token',
      },
      run: async () => {
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
      run: async () => {
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
