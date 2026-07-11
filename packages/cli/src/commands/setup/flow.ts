import { confirm, intro, note, outro, text } from '@clack/prompts'
import {
  type ClientProfile,
  deriveBrandTerms,
  ensureSeoCliDirs,
  saveClient,
} from '@seo/core'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveSite } from '../../selection.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
} from '../../utils.js'
import { slugId, startUrlForSite, suggestedClientName } from '../shared.js'
import {
  chooseGa4Property,
  maybeConnectAuth,
  maybeInstallMcp,
  type SetupAuthStatus,
  type SetupGa4Selection,
  type SetupMcpInstall,
} from './prompts.js'

type SetupResult = {
  client?: ClientProfile
  site: string
  auth: SetupAuthStatus
  ga4?: SetupGa4Selection
  mcp: SetupMcpInstall[]
  next: string[]
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}

function mcpInstallLabel(installs: SetupMcpInstall[]): string {
  const failed = installs.filter((install) => install.error).length
  const installed = installs.length - failed
  if (installs.length === 0) return 'not installed'
  if (failed === 0) return `${installed} installed`
  if (installed === 0) return `${failed} skipped`
  return `${installed} installed, ${failed} skipped`
}

function mcpFailureMessage(installs: SetupMcpInstall[]): string | undefined {
  const failures = installs.filter(
    (install): install is SetupMcpInstall & { error: string } =>
      Boolean(install.error),
  )
  if (failures.length === 0) return undefined
  return failures
    .map((install) => `${install.client}: ${install.error}`)
    .join('\n')
}

export async function runGuidedSetup(
  args: Record<string, unknown>,
): Promise<void> {
  const json = jsonFlag(args)
  if (!json) intro(process.argv[2] === 'start' ? 'seo start' : 'seo setup')

  if (args['dry-run']) {
    const next = [
      'seo auth login',
      'seo start',
      'seo report --project acme',
      'seo refresh-priorities --project acme --verify-content',
      'seo technical-watch --project acme',
    ]
    if (json) {
      printJson({ dryRun: true, next })
    } else {
      note(next.join('\n'), 'This setup will guide you through')
      outro('Dry run complete.')
    }
    return
  }

  ensureSeoCliDirs()
  const siteInput = {
    site: stringArg(args.site),
    options: { json, refresh: booleanArg(args.refresh) },
  }
  const selectedSite = json ? await resolveSite(siteInput) : undefined
  const auth = await maybeConnectAuth(args)
  const site = selectedSite ?? (await resolveSite(siteInput))
  const defaultName = suggestedClientName(site)
  if (canPrompt({ json })) {
    note(
      'A project profile remembers the site and report defaults so future commands stay short.',
      'Project profile',
    )
  }
  const shouldSaveProfile =
    booleanArg(args['skip-profile']) === true
      ? false
      : canPrompt({ json })
        ? maybeExitCancelled(
            await confirm({
              message: 'Save this site as a project profile?',
              initialValue: true,
            }),
          )
        : true

  if (!shouldSaveProfile) {
    const mcp = await maybeInstallMcp(args)
    const siteArg = `--site ${shellArg(site)}`
    const next = [
      `seo report ${siteArg}`,
      `seo refresh-priorities ${siteArg} --verify-content`,
      `seo technical-watch ${siteArg}`,
    ]
    const result: SetupResult = { site, auth, mcp, next }

    if (json) {
      printJson(result)
      return
    }

    printKeyValue([
      ['Project profile', 'not saved'],
      ['GSC property', site],
      ['Auth', auth],
      ['MCP', mcpInstallLabel(mcp)],
    ])
    const mcpFailure = mcpFailureMessage(mcp)
    if (mcpFailure) note(mcpFailure, 'MCP setup skipped')
    note(next.join('\n'), 'Try next')
    outro('Setup complete.')
    return
  }

  const name =
    stringArg(args.name) ??
    (canPrompt({ json })
      ? maybeExitCancelled(
          await text({
            message: 'Project name',
            placeholder: defaultName,
            defaultValue: defaultName,
          }),
        )
      : defaultName)
  const id = stringArg(args.id) ?? slugId(name)
  const defaultStartUrl = startUrlForSite(site) ?? ''
  const startUrl =
    stringArg(args.url) ??
    (canPrompt({ json })
      ? maybeExitCancelled(
          await text({
            message: 'Website URL to crawl',
            placeholder: defaultStartUrl || 'https://example.com',
            defaultValue: defaultStartUrl,
          }),
        )
      : defaultStartUrl || undefined)
  const watchUrls = listArg(args.urls).length > 0 ? listArg(args.urls) : []
  const ga4 = await chooseGa4Property({
    property: stringArg(args.ga4),
    site,
    interactive: canPrompt({ json }),
  })
  const ga4PropertyId = ga4?.propertyId
  const derivedBrandTerms = deriveBrandTerms({ id, name, siteUrl: site })
  const brandTerms =
    listArg(args.brand).length > 0 ? listArg(args.brand) : derivedBrandTerms
  const reportDay = numberArg(args['report-day']) ?? 1
  const technicalWeekday = numberArg(args.weekday) ?? 1
  const isDefault = booleanArg(args.default) ?? true

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
    `seo report --project ${client.id}`,
    `seo refresh-priorities --project ${client.id} --verify-content`,
    `seo technical-watch --project ${client.id}`,
  ]
  const result: SetupResult = { client, site, auth, ga4, mcp, next }

  if (json) {
    printJson(result)
    return
  }

  printKeyValue([
    ['Project profile', `${client.name} (${client.id})`],
    ['GSC property', client.siteUrl],
    ['Crawl URL', client.startUrl ?? 'not set'],
    ['Watch URLs', String(client.watchUrls.length)],
    ['Brand terms', client.brandTerms.join(', ') || 'not set'],
    ['GA4 property', client.ga4PropertyId ?? 'not connected (optional)'],
    ...(ga4 ? [['GA4 selection', ga4.reason] as [string, string]] : []),
    ['Auth', auth],
    ['MCP', mcpInstallLabel(mcp)],
  ])
  const mcpFailure = mcpFailureMessage(mcp)
  if (mcpFailure) note(mcpFailure, 'MCP setup skipped')
  note(next.join('\n'), 'Try next')
  outro('Setup complete.')
}
