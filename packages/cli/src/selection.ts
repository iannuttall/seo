import { type Option, select, text } from '@clack/prompts'
import {
  type ClientProfile,
  ga4PropertyIdFromName,
  getClient,
  listClients,
  listGa4AccountSummaries,
  listSites,
  readConfig,
  SeoError,
  selectGoogleAccounts,
} from '@seo/core'
import { canPrompt, maybeExitCancelled } from './utils.js'

type ResolveOptions = {
  allowDefault?: boolean
  json?: boolean
  refresh?: boolean
  account?: string
}

type SiteChoice = {
  siteUrl: string
  permissionLevel?: string
}

type GoogleAnalyticsPropertyChoice = {
  property: string
  displayName: string
  account: string
}

export type ClientSelection = {
  client?: ClientProfile
  site: string
}

function selectClientGoogleAccounts(client: ClientProfile | undefined): void {
  selectGoogleAccounts(client?.googleAccounts)
}

function includesQuery(values: string[], query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return values.some((value) => value.toLowerCase().includes(normalized))
}

async function chooseFromSearch<T>(input: {
  message: string
  searchMessage: string
  emptyMessage: string
  choices: T[]
  label: (choice: T) => string
  hint?: (choice: T) => string | undefined
  searchValues: (choice: T) => string[]
}): Promise<T> {
  let visible = input.choices

  if (input.choices.length > 8) {
    const query = maybeExitCancelled(
      await text({
        message: input.searchMessage,
        placeholder: 'Type part of the name or URL, or leave blank',
      }),
    )
    visible = input.choices.filter((choice) =>
      includesQuery(input.searchValues(choice), query),
    )

    if (!visible.length) {
      throw new SeoError('INVALID_INPUT', input.emptyMessage)
    }
  }

  return maybeExitCancelled(
    await select({
      message: input.message,
      options: visible.map((choice) => {
        const hint = input.hint?.(choice)
        return {
          value: choice,
          label: input.label(choice),
          ...(hint ? { hint } : {}),
        }
      }) as Option<T>[],
    }),
  )
}

export async function resolveSite(input: {
  site?: string
  options?: ResolveOptions
}): Promise<string> {
  if (input.site) return input.site

  const config = readConfig()
  const defaultSiteKnown =
    Boolean(config.defaultSite) &&
    (config.clients.some((client) => client.siteUrl === config.defaultSite) ||
      config.sites.some((site) => site.siteUrl === config.defaultSite))
  if (
    input.options?.allowDefault !== false &&
    config.defaultSite &&
    defaultSiteKnown
  ) {
    selectClientGoogleAccounts(
      config.clients.find(
        (client) => client.isDefault && client.siteUrl === config.defaultSite,
      ),
    )
    return config.defaultSite
  }

  if (input.options?.json || !canPrompt()) {
    throw new SeoError(
      'INVALID_INPUT',
      config.defaultSite
        ? `Saved default site ${config.defaultSite} does not match any saved project. Pass --site or --project, or run \`seo start\` to save a new default.`
        : 'No site selected. Pass --site, use --project on supported commands, or run `seo start` in a terminal.',
    )
  }

  const sites = await listSites(input.options?.refresh, input.options?.account)
  if (!sites.length) {
    throw new SeoError(
      'PROPERTY_NOT_FOUND',
      'No Search Console properties found for this Google login.',
    )
  }
  if (sites.length === 1) {
    return sites[0]?.siteUrl ?? ''
  }

  const choice = await chooseFromSearch<SiteChoice>({
    message: 'Choose a Search Console property',
    searchMessage: 'Search Search Console properties',
    emptyMessage: 'No Search Console properties matched that search.',
    choices: sites,
    label: (site) => site.siteUrl,
    hint: (site) => site.permissionLevel,
    searchValues: (site) => [site.siteUrl, site.permissionLevel ?? ''],
  })

  return choice.siteUrl
}

export async function resolveClientSelection(input: {
  client?: string
  project?: string
  site?: string
  options?: ResolveOptions
}): Promise<ClientSelection> {
  if (input.client && input.project && input.client !== input.project) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use either --project or --client, not both.',
    )
  }
  const project = input.project ?? input.client
  if (project) {
    const client = getClient(project)
    if (!client) {
      throw new SeoError('INVALID_INPUT', `Project not found: ${project}`)
    }
    selectClientGoogleAccounts(client)
    return { client, site: client.siteUrl }
  }

  const defaultClient = getClient()
  if (!input.site && defaultClient) {
    selectClientGoogleAccounts(defaultClient)
    return { client: defaultClient, site: defaultClient.siteUrl }
  }

  return {
    site: await resolveSite({ site: input.site, options: input.options }),
  }
}

export async function resolveClient(input: {
  client?: string
  project?: string
  options?: ResolveOptions
}): Promise<ClientProfile | undefined> {
  if (input.client && input.project && input.client !== input.project) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use either --project or --client, not both.',
    )
  }
  const project = input.project ?? input.client
  if (project) {
    const client = getClient(project)
    if (!client) {
      throw new SeoError('INVALID_INPUT', `Project not found: ${project}`)
    }
    selectClientGoogleAccounts(client)
    return client
  }

  const clients = listClients()
  if (!clients.length) return undefined
  const defaultClient = getClient()
  if (defaultClient) {
    selectClientGoogleAccounts(defaultClient)
    return defaultClient
  }

  if (input.options?.json || !canPrompt()) return undefined

  const selected = await chooseFromSearch<ClientProfile>({
    message: 'Choose a project',
    searchMessage: 'Search projects',
    emptyMessage: 'No projects matched that search.',
    choices: clients,
    label: (client) => client.name,
    hint: (client) => client.siteUrl,
    searchValues: (client) => [client.id, client.name, client.siteUrl],
  })
  selectClientGoogleAccounts(selected)
  return selected
}

export async function resolveGoogleAnalyticsProperty(input: {
  property?: string
  options?: ResolveOptions
}): Promise<string> {
  if (input.property) return input.property

  const config = readConfig()
  if (config.analytics.google.defaultPropertyId) {
    return config.analytics.google.defaultPropertyId
  }

  if (input.options?.json || !canPrompt()) {
    throw new SeoError(
      'INVALID_INPUT',
      'No Google Analytics property selected. Pass --property or run this command in a terminal to choose one.',
    )
  }

  const accountSummaries = await listGa4AccountSummaries(input.options?.account)
  const choices = accountSummaries.flatMap((account) =>
    account.propertySummaries.map((property) => ({
      property: ga4PropertyIdFromName(property.property),
      displayName: property.displayName ?? property.property,
      account: account.displayName ?? account.account,
    })),
  )

  if (!choices.length) {
    throw new SeoError(
      'PROPERTY_NOT_FOUND',
      'No Google Analytics properties found for this Google login.',
    )
  }
  if (choices.length === 1) {
    return choices[0]?.property ?? ''
  }

  const choice = await chooseFromSearch<GoogleAnalyticsPropertyChoice>({
    message: 'Choose a Google Analytics property',
    searchMessage: 'Search Google Analytics properties',
    emptyMessage: 'No Google Analytics properties matched that search.',
    choices,
    label: (property) => `${property.displayName} (${property.property})`,
    hint: (property) => property.account,
    searchValues: (property) => [
      property.property,
      property.displayName,
      property.account,
    ],
  })

  return choice.property
}
