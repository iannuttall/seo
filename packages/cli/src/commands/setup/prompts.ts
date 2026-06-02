import { confirm, multiselect, password, select, text } from '@clack/prompts'
import {
  authStatus,
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  loginWithLoopback,
  writeOauthClient,
} from '@seo/core'
import { maybeExitCancelled } from '../../utils.js'
import { detectMcpClients, installMcpConfig } from '../mcp-config.js'

export type SetupAuthStatus = 'connected' | 'already-connected' | 'skipped'
export type SetupMcpInstall = { client: string; path: string; changed: boolean }

export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI)
}

export async function maybeConnectAuth(
  args: Record<string, unknown>,
): Promise<SetupAuthStatus> {
  const status = await authStatus()
  if (status.tokens) return 'already-connected'
  if (args['skip-auth'] || !canPrompt()) return 'skipped'

  const choice = maybeExitCancelled(
    await select({
      message: 'Connect Google now?',
      options: status.sharedConfigured
        ? [
            { value: 'login', label: 'Open Google sign-in' },
            { value: 'skip', label: 'Skip for now' },
          ]
        : [
            {
              value: 'setup',
              label: 'Use my own Google OAuth client',
              hint: 'Required in this checkout',
            },
            { value: 'skip', label: 'Skip for now' },
          ],
    }),
  )

  if (choice === 'skip') return 'skipped'
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

  await loginWithLoopback()
  return 'connected'
}

export async function chooseGa4Property(
  explicit?: string,
): Promise<string | undefined> {
  if (explicit) return explicit
  if (!canPrompt()) return undefined

  const summaries = await listGa4AccountSummaries().catch(() => [])
  const properties = summaries.flatMap((account) =>
    account.propertySummaries.map((property) => ({
      property: ga4PropertyIdFromName(property.property),
      label: property.displayName ?? property.property,
      account: account.displayName ?? account.account,
    })),
  )
  if (!properties.length) return undefined

  const choice = maybeExitCancelled(
    await select({
      message: 'Attach a GA4 property?',
      options: [
        { value: '', label: 'Skip GA4 for now' },
        ...properties.map((property) => ({
          value: property.property,
          label: `${property.label} (${property.property})`,
          hint: property.account,
        })),
      ],
    }),
  )
  return choice || undefined
}

export async function maybeInstallMcp(
  args: Record<string, unknown>,
): Promise<SetupMcpInstall[]> {
  if (args['skip-mcp'] || !canPrompt()) return []
  const shouldInstall = maybeExitCancelled(
    await confirm({
      message: 'Install seo as an MCP server too?',
      initialValue: true,
    }),
  )
  if (!shouldInstall) return []

  const detected = detectMcpClients()
  const selected = maybeExitCancelled(
    await multiselect({
      message: 'Which MCP clients?',
      options: detected.map((target) => ({
        value: target.client,
        label: target.client,
        hint: target.path,
      })),
      initialValues: detected.map((target) => target.client),
    }),
  )

  return detected
    .filter((target) => selected.includes(target.client))
    .map((target) => installMcpConfig(target))
}
