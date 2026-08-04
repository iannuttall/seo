import {
  confirm,
  multiselect,
  note,
  password,
  select,
  text,
} from '@clack/prompts'
import {
  type AnalyticsConnection,
  authStatus,
  CLICKY_SITEKEY_ENV,
  ClickyClient,
  type Ga4WebStreamCandidate,
  type Ga4WebStreamMatch,
  ga4MatchReason,
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  listGa4DataStreams,
  loginWithLoopback,
  matchGa4WebStreams,
  readClickySiteKey,
  SeoError,
  writeClickySiteKey,
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
export type SetupGoogleAnalyticsSelection = {
  propertyId: string
  selection: 'explicit' | 'matched' | 'manual'
  reason: string
}
export type SetupClickySelection = {
  siteId: string
  credentialSource: 'environment' | 'keychain' | 'file'
  selection: 'explicit' | 'manual'
}
export type SetupAnalyticsSelection =
  | { provider: 'google'; google: SetupGoogleAnalyticsSelection }
  | { provider: 'clicky'; clicky: SetupClickySelection }
  | { provider: 'none' }
export type SetupSkillInstall = {
  status: 'installed' | 'declined' | 'skipped' | 'failed'
  error?: string
}

type GoogleAnalyticsPropertyChoice = {
  property: string
  label: string
  account: string
}

type GoogleAnalyticsSetupChoice = GoogleAnalyticsPropertyChoice & {
  match?: Ga4WebStreamMatch
}

type AuthSetupChoice = 'login' | 'setup' | 'skip'
type AnalyticsSetupChoice = 'keep' | 'google' | 'clicky' | 'remove' | 'skip'

export function analyticsSetupOptions(current?: AnalyticsConnection): Array<{
  value: AnalyticsSetupChoice
  label: string
  hint?: string
}> {
  const providers: Array<{
    value: AnalyticsSetupChoice
    label: string
    hint?: string
  }> = [
    {
      value: 'google',
      label: 'Google Analytics',
      hint: 'Use a property available to your Google login',
    },
    {
      value: 'clicky',
      label: 'Clicky',
      hint: 'Use a site ID and sitekey from Clicky',
    },
  ]
  if (!current) {
    return [...providers, { value: 'skip', label: 'Skip traffic analytics' }]
  }
  const currentLabel =
    current.provider === 'clicky'
      ? `Clicky site ${current.siteId}`
      : `Google Analytics property ${current.propertyId}`
  return [
    {
      value: 'keep',
      label: `Keep ${currentLabel}`,
      hint: 'Leave this project connection unchanged',
    },
    ...providers,
    { value: 'remove', label: 'Remove traffic analytics' },
  ]
}

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
          hint: 'Opens your browser for read-only Search Console and Google Analytics access',
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

async function findGoogleAnalyticsWebStreamCandidates(
  properties: GoogleAnalyticsPropertyChoice[],
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

export async function chooseGoogleAnalyticsProperty(input: {
  property?: string
  site: string
  interactive?: boolean
}): Promise<SetupGoogleAnalyticsSelection | undefined> {
  if (input.property) {
    return {
      propertyId: input.property,
      selection: 'explicit',
      reason: 'Set with --google-analytics-property.',
    }
  }
  const interactive = input.interactive ?? canPrompt()
  if (!interactive) return undefined

  const summaries = await listGa4AccountSummaries().catch(() => [])
  const properties: GoogleAnalyticsPropertyChoice[] = summaries.flatMap(
    (account) =>
      account.propertySummaries.map((property) => ({
        property: ga4PropertyIdFromName(property.property),
        label: property.displayName ?? property.property,
        account: account.displayName ?? account.account,
      })),
  )
  if (!properties.length) return undefined

  const { candidates, complete: streamsComplete } =
    await findGoogleAnalyticsWebStreamCandidates(properties)
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

  const choices: GoogleAnalyticsSetupChoice[] = matchedProperties.length
    ? matchedProperties.map((match) => ({
        property: match.property,
        label: match.propertyName,
        account: match.account,
        match,
      }))
    : properties

  const choice = maybeExitCancelled(
    await select<GoogleAnalyticsSetupChoice | ''>({
      message: matchedProperties.length
        ? 'Several Google Analytics properties match this site. Which property should seo use?'
        : streamsComplete
          ? 'No Google Analytics web stream clearly matches this site. Attach a property?'
          : 'Some Google Analytics web streams could not be read. Attach a property?',
      options: [
        { value: '', label: 'Skip Google Analytics for now' },
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
        : `Selected ${choice.label} during setup. seo could not read every Google Analytics web stream, so it did not guess a match.`,
  }
}

async function chooseClicky(input: {
  siteId?: string
  interactive: boolean
}): Promise<SetupClickySelection> {
  const siteId =
    input.siteId ??
    (input.interactive
      ? maybeExitCancelled(
          await text({
            message: 'Clicky site ID',
            validate: (value) =>
              /^\d{1,30}$/u.test(value?.trim() ?? '')
                ? undefined
                : 'Enter the numeric site ID from Clicky',
          }),
        )
      : undefined)
  if (!siteId) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass --clicky-site-id when connecting Clicky outside a terminal.',
    )
  }

  const existing = await readClickySiteKey(siteId)
  const siteKey =
    existing?.siteKey ??
    (input.interactive
      ? maybeExitCancelled(
          await password({
            message: 'Clicky sitekey',
            validate: (value) =>
              /^[A-Za-z0-9]{12,64}$/u.test(value?.trim() ?? '')
                ? undefined
                : 'Enter the sitekey from Clicky',
          }),
        )
      : undefined)
  if (!siteKey) {
    throw new SeoError(
      'AUTH_REQUIRED',
      `Set ${CLICKY_SITEKEY_ENV} when connecting Clicky outside a terminal.`,
    )
  }

  await new ClickyClient({ siteId, siteKey }).verify()
  const credentialSource =
    existing?.source ?? (await writeClickySiteKey(siteId, siteKey))
  return {
    siteId,
    credentialSource,
    selection: input.siteId ? 'explicit' : 'manual',
  }
}

export async function chooseAnalyticsForSetup(input: {
  googleProperty?: string
  clickySiteId?: string
  current?: AnalyticsConnection
  site: string
  interactive?: boolean
}): Promise<SetupAnalyticsSelection | undefined> {
  if (input.googleProperty && input.clickySiteId) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass either --google-analytics-property or --clicky-site-id, not both.',
    )
  }
  const interactive = input.interactive ?? canPrompt()
  if (input.clickySiteId) {
    return {
      provider: 'clicky',
      clicky: await chooseClicky({
        siteId: input.clickySiteId,
        interactive,
      }),
    }
  }
  if (input.googleProperty) {
    const google = await chooseGoogleAnalyticsProperty({
      property: input.googleProperty,
      site: input.site,
      interactive,
    })
    return google ? { provider: 'google', google } : undefined
  }
  if (!interactive) return undefined

  const choice = maybeExitCancelled(
    await select<AnalyticsSetupChoice>({
      message: 'Traffic analytics',
      options: analyticsSetupOptions(input.current),
    }),
  )
  if (choice === 'keep') return undefined
  if (choice === 'remove') return { provider: 'none' }
  if (choice === 'skip') return undefined
  if (choice === 'clicky') {
    return {
      provider: 'clicky',
      clicky: await chooseClicky({ interactive }),
    }
  }
  const google = await chooseGoogleAnalyticsProperty({
    site: input.site,
    interactive,
  })
  if (!google) {
    note(
      'No Google Analytics property was available for this Google login. You can connect one later.',
      'Traffic analytics skipped',
    )
  }
  return google ? { provider: 'google', google } : undefined
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
