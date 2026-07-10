import { confirm, multiselect, password, select, text } from '@clack/prompts'
import {
  authStatus,
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  loginWithLoopback,
  SeoError,
  writeOauthClient,
} from '@seo/core'
import { canPrompt, maybeExitCancelled } from '../../utils.js'
import { detectMcpClients } from '../mcp-clients.js'
import { installMcpConfig } from '../mcp-config.js'

export type SetupAuthStatus = 'connected' | 'already-connected' | 'skipped'
export type SetupMcpInstall = { client: string; path: string; changed: boolean }

export async function maybeConnectAuth(
  args: Record<string, unknown>,
): Promise<SetupAuthStatus> {
  const status = await authStatus()
  if (status.tokens) return 'already-connected'
  if (args['skip-auth']) return 'skipped'
  if (!canPrompt({ json: args.json === true })) {
    throw new SeoError(
      'AUTH_REQUIRED',
      'Not logged in. Run `seo auth login`, or pass --skip-auth to save a project profile without connecting Google.',
    )
  }

  const canSkip = typeof args.site === 'string' && args.site.length > 0
  const skipOption = canSkip
    ? [{ value: 'skip' as const, label: 'Skip for now' }]
    : []

  const choice = maybeExitCancelled(
    await select({
      message: 'Connect Google now?',
      options: status.sharedConfigured
        ? [{ value: 'login', label: 'Open Google sign-in' }, ...skipOption]
        : [
            {
              value: 'setup',
              label: 'Use my own Google OAuth client',
              hint: 'Required in this checkout',
            },
            ...skipOption,
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
  interactive = canPrompt(),
): Promise<string | undefined> {
  if (explicit) return explicit
  if (!interactive) return undefined

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
  if (args['skip-mcp'] || !canPrompt({ json: args.json === true })) return []
  const detected = detectMcpClients()
  if (detected.length === 0) return []
  const shouldInstall = maybeExitCancelled(
    await confirm({
      message: 'Install seo as an MCP server too?',
      initialValue: true,
    }),
  )
  if (!shouldInstall) return []

  const selected = maybeExitCancelled(
    await multiselect({
      message: 'Which MCP clients?',
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
    .map((target) => installMcpConfig(target))
}
