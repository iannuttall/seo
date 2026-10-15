import {
  confirm,
  multiselect,
  note,
  password,
  select,
  text,
} from '@clack/prompts'
import {
  authStatus,
  listGoogleAccounts,
  SeoError,
  setActiveGoogleAccount,
  writeOauthClient,
} from '@seo/core'
import { maybeExitCancelled } from '../../utils.js'
import { loginWithGuidance } from '../google-login.js'
import { detectMcpClients } from '../mcp-clients.js'
import { installMcpConfig } from '../mcp-config.js'
import { installSeoSkill } from '../skill-install.js'

export type SetupAuthResult = {
  status: 'connected' | 'already-connected' | 'service-account' | 'skipped'
  accountEmail?: string
}
export type SetupMcpInstall = {
  client: string
  path: string
  server: 'local'
  changed: boolean
  error?: string
}
export type SetupSkillInstall = {
  status: 'installed' | 'declined' | 'skipped' | 'failed'
  error?: string
}

type AuthSetupChoice = 'login' | 'setup' | 'skip'
type SavedGoogleAccountChoice =
  | { type: 'account'; accountEmail: string }
  | { type: 'connect' }
  | { type: 'skip' }

export function authSetupOptions(input: {
  sharedConfigured: boolean
  byoConfigured: boolean
}): Array<{
  value: AuthSetupChoice
  label: string
  hint?: string
}> {
  const skip = { value: 'skip' as const, label: 'Skip for now' }
  return input.sharedConfigured || input.byoConfigured
    ? [
        {
          value: 'login',
          label: 'Connect Google',
          hint: 'Opens your browser for read-only Search Console and Google Analytics access',
        },
        skip,
      ]
    : [
        {
          value: 'setup',
          label: 'Set up Google login for local development',
          hint: 'This source checkout does not include the public app credentials',
        },
        skip,
      ]
}

async function login(): Promise<SetupAuthResult> {
  const tokens = await loginWithGuidance()
  note(
    `Connected as ${tokens.account_email}. seo has read-only access and cannot change your site.`,
    'Google connected',
  )
  return { status: 'connected', accountEmail: tokens.account_email }
}

export async function maybeConnectAuth(input: {
  interactive: boolean
}): Promise<SetupAuthResult> {
  const status = await authStatus()
  if (status.activeMode === 'service-account') {
    return { status: 'service-account', accountEmail: status.identity }
  }
  if (!input.interactive) {
    if (status.tokens) {
      return {
        status: 'already-connected',
        accountEmail: status.tokens.account_email,
      }
    }
    throw new SeoError(
      'AUTH_REQUIRED',
      'Not signed in. Run `seo start` or `seo auth login` in a terminal.',
    )
  }

  const accounts = listGoogleAccounts()
  if (accounts.length > 0) {
    const choice = maybeExitCancelled(
      await select<SavedGoogleAccountChoice>({
        message: 'Google account to use',
        options: [
          ...accounts.map((account) => ({
            value: {
              type: 'account' as const,
              accountEmail: account.accountEmail,
            },
            label: account.accountEmail,
            hint: account.active ? 'Current default' : undefined,
          })),
          {
            value: { type: 'connect' as const },
            label: 'Connect another Google account',
          },
        ],
      }),
    )
    if (choice.type === 'account') {
      setActiveGoogleAccount(choice.accountEmail)
      return { status: 'already-connected', accountEmail: choice.accountEmail }
    }
    if (status.sharedConfigured || status.byoConfigured) return login()
  }

  const choice = maybeExitCancelled(
    await select<AuthSetupChoice>({
      message: 'Connect Google now?',
      options: authSetupOptions({
        sharedConfigured: status.sharedConfigured,
        byoConfigured: status.byoConfigured,
      }),
    }),
  )
  if (choice === 'skip') return { status: 'skipped' }
  if (choice === 'setup') {
    const clientId = maybeExitCancelled(
      await text({
        message: 'Google Desktop OAuth client ID',
        validate: (value) => (value ? undefined : 'Client ID is required'),
      }),
    )
    const clientSecret = maybeExitCancelled(
      await password({
        message: 'Google Desktop OAuth client secret',
        validate: (value) => (value ? undefined : 'Client secret is required'),
      }),
    )
    writeOauthClient({ clientId, clientSecret })
  }
  return login()
}

export async function maybeInstallSkill(): Promise<SetupSkillInstall> {
  const shouldInstall = maybeExitCancelled(
    await confirm({
      message: 'Install the SEO skill so your agents know how to use seo?',
      initialValue: true,
    }),
  )
  if (!shouldInstall) return { status: 'declined' }
  return installSeoSkill()
}

export async function maybeInstallMcp(): Promise<SetupMcpInstall[]> {
  const detected = detectMcpClients()
  if (detected.length === 0) return []
  const shouldInstall = maybeExitCancelled(
    await confirm({
      message: 'Add the seo MCP server to your agents?',
      initialValue: true,
    }),
  )
  if (!shouldInstall) return []

  const selected = maybeExitCancelled(
    await multiselect({
      message: 'Which agents?',
      options: detected.map((target) => ({
        value: target.client,
        label: target.label,
        hint: target.path,
      })),
      initialValues: detected.map((target) => target.client),
    }),
  )

  return detected
    .filter((target) => selected.includes(target.client))
    .map((target) => {
      try {
        return { ...installMcpConfig(target), server: 'local' as const }
      } catch (error) {
        return {
          client: target.client,
          path: target.path,
          server: 'local' as const,
          changed: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
}
