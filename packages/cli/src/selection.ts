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
} from '@seo/core'
import { canPrompt, maybeExitCancelled } from './utils.js'

type ResolveOptions = {
  json?: boolean
  refresh?: boolean
}

type SiteChoice = {
  siteUrl: string
  permissionLevel?: string
}

type Ga4Choice = {
  property: string
  displayName: string
  account: string
}

export type ClientSelection = {
  client?: ClientProfile
  site: string
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
  if (config.defaultSite) return config.defaultSite

  if (input.options?.json || !canPrompt()) {
    throw new SeoError(
      'INVALID_INPUT',
      'No site selected. Pass --site, use --project on supported commands, or run `seo start` in a terminal.',
    )
  }

  const sites = await listSites(input.options?.refresh)
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
    return { client, site: client.siteUrl }
  }

  const defaultClient = getClient()
  if (!input.site && defaultClient) {
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
    return client
  }

  const clients = listClients()
  if (!clients.length) return undefined
  const defaultClient = getClient()
  if (defaultClient) return defaultClient

  if (input.options?.json || !canPrompt()) return undefined

  return chooseFromSearch<ClientProfile>({
    message: 'Choose a project',
    searchMessage: 'Search projects',
    emptyMessage: 'No projects matched that search.',
    choices: clients,
    label: (client) => client.name,
    hint: (client) => client.siteUrl,
    searchValues: (client) => [client.id, client.name, client.siteUrl],
  })
}

export async function resolveGa4Property(input: {
  property?: string
  options?: ResolveOptions
}): Promise<string> {
  if (input.property) return input.property

  const config = readConfig()
  if (config.google.defaultGa4PropertyId) {
    return config.google.defaultGa4PropertyId
  }

  if (input.options?.json || !canPrompt()) {
    throw new SeoError(
      'INVALID_INPUT',
      'No GA4 property selected. Pass --property or run this command in a terminal to choose one.',
    )
  }

  const accountSummaries = await listGa4AccountSummaries()
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
      'No GA4 properties found for this Google login.',
    )
  }
  if (choices.length === 1) {
    return choices[0]?.property ?? ''
  }

  const choice = await chooseFromSearch<Ga4Choice>({
    message: 'Choose a GA4 property',
    searchMessage: 'Search GA4 properties',
    emptyMessage: 'No GA4 properties matched that search.',
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
