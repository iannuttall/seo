import {
  confirm,
  intro,
  multiselect,
  note,
  outro,
  password,
  select,
  text,
} from '@clack/prompts'
import {
  authStatus,
  type ClientProfile,
  deriveBrandTerms,
  ensureSeoCliDirs,
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  loginWithLoopback,
  saveClient,
  writeOauthClient,
} from '@seo/core'
import { defineCommand } from 'citty'
import { resolveSite } from '../selection.js'
import { maybeExitCancelled, printJson, printKeyValue } from '../utils.js'
import { detectMcpClients, installMcpConfig } from './mcp-config.js'

type SetupResult = {
  client: ClientProfile
  auth: 'connected' | 'already-connected' | 'skipped'
  mcp: Array<{ client: string; path: string; changed: boolean }>
  next: string[]
}

const stringArg = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const numberArg = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const jsonFlag = (args: Record<string, unknown>): boolean => args.json === true

function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI)
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function urlList(value: unknown): string[] {
  const raw = stringArg(value)
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function startUrlForSite(site: string): string {
  if (site.startsWith('http://') || site.startsWith('https://')) return site
  if (site.startsWith('sc-domain:')) return `https://${site.slice(10)}/`
  return ''
}

function suggestedName(site: string): string {
  return site.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '')
}

async function maybeConnectAuth(
  args: Record<string, unknown>,
): Promise<SetupResult['auth']> {
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

async function chooseGa4Property(
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

async function maybeInstallMcp(
  args: Record<string, unknown>,
): Promise<SetupResult['mcp']> {
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

async function runGuidedSetup(args: Record<string, unknown>): Promise<void> {
  ensureSeoCliDirs()
  const json = jsonFlag(args)
  if (!json) intro('seo setup')

  if (args['dry-run']) {
    const next = [
      'seo auth login',
      'seo client add --id acme --site sc-domain:example.com --url https://example.com --default',
      'seo diagnose-property --client acme',
      'seo schedule cron --client acme',
    ]
    if (json) {
      printJson({ dryRun: true, next })
    } else {
      note(next.join('\n'), 'This setup will guide you through')
      outro('Dry run complete.')
    }
    return
  }

  const auth = await maybeConnectAuth(args)
  const site = await resolveSite({
    site: stringArg(args.site),
    options: { json, refresh: booleanArg(args.refresh) },
  })
  const defaultName = suggestedName(site)

  const name =
    stringArg(args.name) ??
    (canPrompt()
      ? maybeExitCancelled(
          await text({
            message: 'Client name',
            placeholder: defaultName,
            defaultValue: defaultName,
          }),
        )
      : defaultName)
  const id =
    stringArg(args.id) ??
    (canPrompt()
      ? maybeExitCancelled(
          await text({
            message: 'Client id',
            placeholder: slug(name),
            defaultValue: slug(name),
          }),
        )
      : slug(name))
  const defaultStartUrl = startUrlForSite(site)
  const startUrl =
    stringArg(args.url) ??
    (canPrompt()
      ? maybeExitCancelled(
          await text({
            message: 'Default crawl start URL',
            placeholder: defaultStartUrl || 'https://example.com',
            defaultValue: defaultStartUrl,
          }),
        )
      : defaultStartUrl || undefined)
  const watchUrls =
    urlList(args.urls).length > 0
      ? urlList(args.urls)
      : canPrompt()
        ? urlList(
            maybeExitCancelled(
              await text({
                message: 'URLs to watch with URL Inspection',
                placeholder: startUrl ? `${startUrl}` : 'comma-separated URLs',
              }),
            ),
          )
        : []
  const ga4PropertyId = await chooseGa4Property(stringArg(args.ga4))
  const derivedBrandTerms = deriveBrandTerms({ id, name, siteUrl: site })
  const brandTerms =
    urlList(args.brand).length > 0
      ? urlList(args.brand)
      : canPrompt()
        ? urlList(
            maybeExitCancelled(
              await text({
                message:
                  'Brand query terms to exclude from opportunity reports',
                placeholder: derivedBrandTerms.join(', '),
                defaultValue: derivedBrandTerms.join(', '),
              }),
            ),
          )
        : derivedBrandTerms
  const reportDay = numberArg(args['report-day']) ?? 1
  const technicalWeekday = numberArg(args.weekday) ?? 1
  const isDefault =
    booleanArg(args.default) ??
    (canPrompt()
      ? maybeExitCancelled(
          await confirm({
            message: 'Make this the default client?',
            initialValue: true,
          }),
        )
      : true)

  const client = saveClient({
    id,
    name,
    siteUrl: site,
    startUrl,
    watchUrls,
    brandTerms,
    ga4PropertyId,
    reportDay,
    technicalWeekday,
    isDefault,
  })
  const mcp = await maybeInstallMcp(args)
  const next = [
    `seo diagnose-property --client ${client.id}`,
    `seo monthly-report --client ${client.id}`,
    `seo technical-watch --client ${client.id}`,
    `seo schedule cron --client ${client.id}`,
  ]
  const result: SetupResult = { client, auth, mcp, next }

  if (json) {
    printJson(result)
    return
  }

  printKeyValue([
    ['Client', `${client.name} (${client.id})`],
    ['GSC property', client.siteUrl],
    ['Crawl URL', client.startUrl ?? 'not set'],
    ['Watch URLs', String(client.watchUrls.length)],
    ['Brand terms', client.brandTerms.join(', ') || 'not set'],
    ['GA4 property', client.ga4PropertyId ?? 'not set'],
    ['Auth', auth],
    ['MCP installs', String(mcp.length)],
  ])
  note(next.join('\n'), 'Try next')
  outro('Setup complete.')
}

export const setupCommand = defineCommand({
  meta: {
    name: 'setup',
    description: 'Guided setup for auth, one client, MCP, and next commands',
  },
  args: {
    id: { type: 'string', description: 'Short stable client id.' },
    name: { type: 'string', description: 'Human client name.' },
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    url: { type: 'string', description: 'Default technical crawl start URL.' },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs to watch with URL Inspection.',
    },
    ga4: { type: 'string', description: 'Optional GA4 property ID.' },
    brand: {
      type: 'string',
      description: 'Comma-separated branded query terms to exclude by default.',
    },
    'report-day': {
      type: 'string',
      description: 'Preferred monthly report day. Defaults to 1.',
    },
    weekday: {
      type: 'string',
      description: 'Preferred technical-watch weekday. Defaults to Monday.',
    },
    default: {
      type: 'boolean',
      description: 'Make this the default client.',
    },
    'skip-auth': {
      type: 'boolean',
      default: false,
      description: 'Skip Google sign-in during setup.',
    },
    'skip-mcp': {
      type: 'boolean',
      default: false,
      description: 'Skip MCP install prompts.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Refresh GSC property discovery.',
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Show what setup does without changing files.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => runGuidedSetup(args),
})

export const clientSetupCommand = defineCommand({
  ...setupCommand,
  meta: {
    name: 'setup',
    description: 'Guided setup for one saved SEO client',
  },
})
