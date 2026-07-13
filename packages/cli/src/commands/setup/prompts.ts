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
  type Ga4WebStreamCandidate,
  type Ga4WebStreamMatch,
  ga4MatchReason,
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  listGa4DataStreams,
  loginWithLoopback,
  matchGa4WebStreams,
  SeoError,
  writeOauthClient,
} from '@seo/core'
import { canPrompt, maybeExitCancelled } from '../../utils.js'
import { detectMcpClients } from '../mcp-clients.js'
import { installMcpConfig } from '../mcp-config.js'
import { installSeoSkill } from '../skill-install.js'

export type SetupAuthStatus =
  | 'connected'
  | 'already-connected'
  | 'service-account'
  | 'skipped'
export type SetupMcpInstall = {
  client: string
  path: string
  changed: boolean
  error?: string
}
export type SetupGa4Selection = {
  propertyId: string
  selection: 'explicit' | 'matched' | 'manual'
  reason: string
}
export type SetupSkillInstall = {
  status: 'installed' | 'declined' | 'skipped' | 'failed'
  error?: string
}

type Ga4PropertyChoice = {
  property: string
  label: string
  account: string
}

type Ga4SetupChoice = Ga4PropertyChoice & {
  match?: Ga4WebStreamMatch
}

type AuthSetupChoice = 'login' | 'setup' | 'skip'

export function authSetupOptions(input: {
  sharedConfigured: boolean
  byoConfigured: boolean
  canSkip: boolean
}): Array<{
  value: AuthSetupChoice
  label: string
  hint?: string
}> {
  const skipOption = input.canSkip
    ? [{ value: 'skip' as const, label: 'Skip for now' }]
    : []
  const hasOauthClient = input.sharedConfigured || input.byoConfigured

  return hasOauthClient
    ? [
        {
          value: 'login',
          label: 'Connect Google',
          hint: 'Opens your browser for read-only Search Console and GA4 access',
        },
        ...skipOption,
      ]
    : [
        {
          value: 'setup',
          label: 'Set up Google login for local development',
          hint: 'This source checkout does not include the public app credentials',
        },
        ...skipOption,
      ]
}

async function findGa4WebStreamCandidates(
  properties: Ga4PropertyChoice[],
): Promise<{ candidates: Ga4WebStreamCandidate[]; complete: boolean }> {
  const candidates: Ga4WebStreamCandidate[] = []
  let complete = true
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < properties.length) {
      const property = properties[nextIndex]
      nextIndex += 1
      if (!property) continue

      try {
        const streams = await listGa4DataStreams(property.property)
        candidates.push(
          ...streams
            .filter((stream) => stream.webStreamData)
            .map((stream) => ({
              account: property.account,
              property: property.property,
              propertyName: property.label,
              stream,
            })),
        )
      } catch {
        complete = false
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(properties.length, 4) }, () => worker()),
  )
  return { candidates, complete }
}

export async function maybeConnectAuth(
  args: Record<string, unknown>,
): Promise<SetupAuthStatus> {
  const status = await authStatus()
  if (status.activeMode === 'service-account') return 'service-account'
  if (status.tokens) return 'already-connected'
  if (args['skip-auth']) return 'skipped'
  if (!canPrompt({ json: args.json === true })) {
    throw new SeoError(
      'AUTH_REQUIRED',
      'Not logged in. Run `seo auth login`, or pass --skip-auth to save a project profile without connecting Google.',
    )
  }

  const choice = maybeExitCancelled(
    await select<AuthSetupChoice>({
      message: 'Connect Google now?',
      options: authSetupOptions({
        sharedConfigured: status.sharedConfigured,
        byoConfigured: status.byoConfigured,
        canSkip: typeof args.site === 'string' && args.site.length > 0,
      }),
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

  const tokens = await loginWithLoopback()
  note(
    `Connected as ${tokens.account_email}. seo has read-only access and cannot change your site.`,
    'Google connected',
  )
  return 'connected'
}

export async function chooseGa4Property(input: {
  property?: string
  site: string
  interactive?: boolean
}): Promise<SetupGa4Selection | undefined> {
  if (input.property) {
    return {
      propertyId: input.property,
      selection: 'explicit',
      reason: 'Set with --ga4.',
    }
  }
  const interactive = input.interactive ?? canPrompt()
  if (!interactive) return undefined

  const summaries = await listGa4AccountSummaries().catch(() => [])
  const properties: Ga4PropertyChoice[] = summaries.flatMap((account) =>
    account.propertySummaries.map((property) => ({
      property: ga4PropertyIdFromName(property.property),
      label: property.displayName ?? property.property,
      account: account.displayName ?? account.account,
    })),
  )
  if (!properties.length) return undefined

  const { candidates, complete: streamsComplete } =
    await findGa4WebStreamCandidates(properties)
  const matches = streamsComplete
    ? matchGa4WebStreams(input.site, candidates)
    : []
  const matchesByProperty = new Map<string, Ga4WebStreamMatch>()
  for (const match of matches) {
    matchesByProperty.set(match.property, match)
  }
  const matchedProperties = [...matchesByProperty.values()]

  if (matchedProperties.length === 1) {
    const match = matchedProperties[0]
    if (!match) return undefined
    return {
      propertyId: match.property,
      selection: 'matched',
      reason: ga4MatchReason(match, input.site),
    }
  }

  const choices: Ga4SetupChoice[] = matchedProperties.length
    ? matchedProperties.map((match) => ({
        property: match.property,
        label: match.propertyName,
        account: match.account,
        match,
      }))
    : properties

  const choice = maybeExitCancelled(
    await select<Ga4SetupChoice | ''>({
      message: matchedProperties.length
        ? 'Several GA4 properties match this site. Which property should seo use?'
        : streamsComplete
          ? 'No GA4 web stream clearly matches this site. Attach a property?'
          : 'Some GA4 web streams could not be read. Attach a property?',
      options: [
        { value: '', label: 'Skip GA4 for now' },
        ...choices.map((property) => ({
          value: property,
          label: `${property.label} (${property.property})`,
          hint: property.match
            ? ga4MatchReason(property.match, input.site)
            : property.account,
        })),
      ],
    }),
  )
  if (!choice) return undefined

  return {
    propertyId: choice.property,
    selection: 'manual',
    reason: choice.match
      ? ga4MatchReason(choice.match, input.site)
      : streamsComplete
        ? `Selected ${choice.label} during setup. Its web stream did not clearly match ${input.site}.`
        : `Selected ${choice.label} during setup. seo could not read every GA4 web stream, so it did not guess a match.`,
  }
}

export async function maybeInstallSkill(
  args: Record<string, unknown>,
): Promise<SetupSkillInstall> {
  if (args['skip-skill'] || !canPrompt({ json: args.json === true })) {
    return { status: 'skipped' }
  }
  const shouldInstall = maybeExitCancelled(
    await confirm({
      message:
        'Install the SEO skill so coding agents know how to run reports?',
      initialValue: true,
    }),
  )
  if (!shouldInstall) return { status: 'declined' }

  return installSeoSkill()
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
    .map((target) => {
      try {
        return installMcpConfig(target)
      } catch (error) {
        return {
          client: target.client,
          path: target.path,
          changed: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
}
