import { intro, note, outro, password, select } from '@clack/prompts'
import {
  BING_API_KEY_ENV,
  BING_API_KEY_SECRET,
  BingWebmasterClient,
  type BingWebmasterSite,
  bingWebmasterOverview,
  bingWebmasterSiteUrl,
  createBingWebmasterClient,
  deleteProviderSecret,
  readProviderSecret,
  SeoError,
  setClientBingSite,
  writeProviderSecret,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, projectArg, stringArg } from '../../args.js'
import { resolveClient } from '../../selection.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
  printTable,
} from '../../utils.js'

function verifiedSites(sites: BingWebmasterSite[]): BingWebmasterSite[] {
  return sites.filter((site) => site.isVerified)
}

function host(value: string): string | undefined {
  if (value.startsWith('sc-domain:')) {
    return value
      .slice('sc-domain:'.length)
      .replace(/^www\./, '')
      .toLowerCase()
  }
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return undefined
  }
}

export function matchBingSite(
  projectSite: string,
  sites: BingWebmasterSite[],
): BingWebmasterSite | undefined {
  const projectHost = host(projectSite)
  if (!projectHost) return undefined
  const matches = verifiedSites(sites).filter(
    (site) => host(site.url) === projectHost,
  )
  return matches.length === 1 ? matches[0] : undefined
}

async function chooseSite(input: {
  explicitSite?: string
  projectSite?: string
  savedSite?: string
  sites: BingWebmasterSite[]
  json?: boolean
}): Promise<string | undefined> {
  const verified = verifiedSites(input.sites)
  const explicit = input.explicitSite ?? input.savedSite
  if (explicit) {
    const match = verified.find((site) => site.url === explicit)
    if (!match) {
      throw new SeoError(
        'PROPERTY_NOT_FOUND',
        `Bing Webmaster did not return a verified site matching ${explicit}.`,
      )
    }
    return match.url
  }
  const matched = input.projectSite
    ? matchBingSite(input.projectSite, verified)
    : undefined
  if (matched) return matched.url
  if (verified.length === 1) return verified[0]?.url
  if (verified.length === 0) return undefined
  if (!canPrompt({ json: input.json })) {
    throw new SeoError(
      'INVALID_INPUT',
      'Several verified Bing sites are available. Pass --site to choose one.',
    )
  }
  return maybeExitCancelled(
    await select({
      message: 'Choose a verified Bing Webmaster site',
      options: verified.map((site) => ({ value: site.url, label: site.url })),
    }),
  )
}

const selectionArgs = {
  project: { type: 'string', description: 'Saved project id or name.' },
  client: { type: 'string', description: 'Legacy alias for --project.' },
  site: { type: 'string', description: 'Verified Bing Webmaster site URL.' },
} as const

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Connect Bing Webmaster and attach a verified site',
  },
  args: {
    ...selectionArgs,
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    if (!canPrompt({ json })) {
      throw new SeoError(
        'AUTH_REQUIRED',
        'Run `seo providers bing connect` in a terminal. Agents and CI can set SEO_BING_API_KEY and run the report directly.',
      )
    }

    intro('Connect Bing Webmaster')
    note(
      'Paste the API key from Bing Webmaster Tools Settings, then API Access. The key stays on this machine.',
      'API key',
    )
    const apiKey = maybeExitCancelled(
      await password({
        message: 'Bing Webmaster API key',
        validate: (value) =>
          value?.trim() ? undefined : 'API key is required',
      }),
    )
    const client = new BingWebmasterClient({ apiKey })
    const discovered = await client.listSites()
    const project = await resolveClient({
      project: projectArg(args),
      options: { json },
    })
    const site = await chooseSite({
      explicitSite: stringArg(args.site),
      projectSite: project?.siteUrl,
      savedSite: bingWebmasterSiteUrl(project),
      sites: discovered.sites,
      json,
    })
    if (!site) {
      throw new SeoError(
        'PROPERTY_NOT_FOUND',
        'No verified Bing Webmaster sites were found for this API key.',
      )
    }

    await writeProviderSecret(BING_API_KEY_SECRET, apiKey)
    const savedProject = project
      ? setClientBingSite(project.id, site)
      : undefined
    note(
      `${site}${savedProject ? ` is attached to ${savedProject.name}.` : ' is ready for direct reports.'}`,
      'Bing connected',
    )
    outro(
      savedProject
        ? `Run seo providers bing report --project ${savedProject.id}`
        : `Run seo providers bing report --site ${site}`,
    )
  },
})

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show the local Bing connection' },
  args: {
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const credential = await readProviderSecret({
      name: BING_API_KEY_SECRET,
      envVar: BING_API_KEY_ENV,
    })
    const project = await resolveClient({
      project: projectArg(args),
      options: { json: jsonFlag(args) },
    })
    const status = {
      connected: Boolean(credential),
      credentialSource: credential?.source,
      project: project
        ? {
            id: project.id,
            name: project.name,
            site: bingWebmasterSiteUrl(project),
          }
        : undefined,
    }
    if (jsonFlag(args)) {
      printJson(status)
      return
    }
    printKeyValue([
      ['Connected', status.connected ? 'yes' : 'no'],
      ['Credential', status.credentialSource ?? 'missing'],
      ['Project', status.project?.name ?? 'not selected'],
      ['Bing site', status.project?.site ?? 'not attached'],
    ])
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove the saved Bing Webmaster credential',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    await deleteProviderSecret(BING_API_KEY_SECRET)
    const result = {
      disconnected: true,
      note: 'Saved project site mappings were kept for a later reconnect.',
    }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`${result.note}\n`)
  },
})

const sitesCommand = defineCommand({
  meta: { name: 'sites', description: 'List Bing Webmaster sites' },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const { client, credentialSource } = await createBingWebmasterClient()
    const result = await client.listSites()
    const output = { ...result, credentialSource }
    if (jsonFlag(args)) {
      printJson(output)
      return
    }
    printTable(
      ['Site', 'Verified'],
      result.sites.map((site) => [site.url, site.isVerified ? 'yes' : 'no']),
    )
  },
})

const reportCommand = defineCommand({
  meta: {
    name: 'report',
    description: 'Find Bing traffic, crawl, query, and page insights',
  },
  args: {
    ...selectionArgs,
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const project = await resolveClient({
      project: projectArg(args),
      options: { json },
    })
    const site = stringArg(args.site) ?? bingWebmasterSiteUrl(project)
    if (!site) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass --site or connect Bing Webmaster to a saved project first.',
      )
    }
    const report = await bingWebmasterOverview({ site })
    if (json) {
      printJson(report)
      return
    }
    const traffic =
      report.traffic.status === 'unavailable' ? undefined : report.traffic.data
    const crawl =
      report.crawl.status === 'unavailable' ? undefined : report.crawl.data
    const comparison = traffic?.analysis
    printKeyValue([
      ['Site', report.site],
      ['Data status', report.dataStatus],
      [
        'Latest 28-day clicks',
        comparison ? String(comparison.current.clicks) : 'unavailable',
      ],
      [
        'Click change',
        comparison?.changes.clicksPercent === null ||
        comparison?.changes.clicksPercent === undefined
          ? 'unavailable'
          : `${comparison.changes.clicksPercent.toFixed(1)}%`,
      ],
      [
        'Latest 28-day impressions',
        comparison ? String(comparison.current.impressions) : 'unavailable',
      ],
      [
        'Impression change',
        comparison?.changes.impressionsPercent === null ||
        comparison?.changes.impressionsPercent === undefined
          ? 'unavailable'
          : `${comparison.changes.impressionsPercent.toFixed(1)}%`,
      ],
      [
        'Latest crawled pages',
        crawl?.latest?.crawledPages === undefined
          ? 'unavailable'
          : String(crawl.latest.crawledPages),
      ],
      [
        'Latest 4xx responses',
        crawl?.latest?.code4xx === undefined
          ? 'unavailable'
          : String(crawl.latest.code4xx),
      ],
      ['Findings', String(report.summary.findings)],
    ])
    if (report.findings.length) {
      process.stdout.write('\nReview first\n')
      for (const finding of report.findings.slice(0, 5)) {
        process.stdout.write(`- ${finding.title}\n  ${finding.verification}\n`)
      }
    }
    for (const caveat of report.caveats) process.stdout.write(`\n${caveat}\n`)
  },
})

export const bingProviderCommand = defineCommand({
  meta: { name: 'bing', description: 'Connect and report on Bing Webmaster' },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    disconnect: disconnectCommand,
    sites: sitesCommand,
    report: reportCommand,
  },
})
