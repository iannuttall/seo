import { intro, note, outro, text } from '@clack/prompts'
import {
  analyticsConnection,
  type ClientProfile,
  deriveBrandTerms,
  ensureSeoCliDirs,
  listClients,
  saveClient,
  updateClient,
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
  printCallout,
  printJson,
  printKeyValue,
} from '../../utils.js'
import { slugId, startUrlForSite, suggestedClientName } from '../shared.js'
import {
  chooseSetupProjectTarget,
  nextAvailableProjectId,
} from './project-target.js'
import {
  chooseAnalyticsForSetup,
  maybeConnectAuth,
  maybeInstallMcp,
  maybeInstallSkill,
  type SetupAuthStatus,
  type SetupClickySelection,
  type SetupGoogleAnalyticsSelection,
  type SetupMcpInstall,
  type SetupSkillInstall,
} from './prompts.js'

type SetupResult = {
  client?: ClientProfile
  site: string
  auth: SetupAuthStatus
  googleAnalytics?: SetupGoogleAnalyticsSelection
  clicky?: SetupClickySelection
  mcp: SetupMcpInstall[]
  skill?: SetupSkillInstall
  next: string[]
}

function skillInstallLabel(skill: SetupSkillInstall): string {
  if (skill.status === 'installed') return 'installed'
  if (skill.status === 'failed') return 'install failed'
  return 'not installed'
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}

function printStarAsk(): void {
  process.stdout.write('\n')
  printCallout({
    title: 'Help other people find SEO Skill',
    body: 'If SEO Skill saved you time, a GitHub star helps other people find it.',
    command: 'https://github.com/iannuttall/seo',
  })
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
  const interactive = canPrompt({ json })
  if (interactive) {
    note(
      'A project profile remembers one site and its report defaults so future commands stay short.',
      'Project profiles',
    )
  }
  const clients = listClients()
  const projectTarget = await chooseSetupProjectTarget({
    clients,
    interactive,
    requestedId: stringArg(args.id),
    skipProfile: booleanArg(args['skip-profile']),
  })
  const existingProject =
    projectTarget.mode === 'update' ? projectTarget.client : undefined
  const selectedProjectSite = stringArg(args.site) ?? existingProject?.siteUrl
  const siteInput = {
    site: selectedProjectSite,
    options: {
      allowDefault: projectTarget.mode === 'update',
      json,
      refresh: booleanArg(args.refresh),
    },
  }
  const selectedSite = json ? await resolveSite(siteInput) : undefined
  const auth = await maybeConnectAuth(
    selectedProjectSite ? { ...args, site: selectedProjectSite } : args,
  )
  const site = selectedSite ?? (await resolveSite(siteInput))
  const defaultName = suggestedClientName(site)

  if (projectTarget.mode === 'skip') {
    const mcp = await maybeInstallMcp(args)
    const skill = await maybeInstallSkill(args)
    const siteArg = `--site ${shellArg(site)}`
    const next = [
      `seo report ${siteArg}`,
      `seo refresh-priorities ${siteArg} --verify-content`,
      `seo technical-watch ${siteArg}`,
    ]
    const result: SetupResult = { site, auth, mcp, skill, next }

    if (json) {
      printJson(result)
      return
    }

    printKeyValue([
      ['Project profile', 'not saved'],
      ['GSC property', site],
      ['Auth', auth],
      ['MCP', mcpInstallLabel(mcp)],
      ['SEO skill', skillInstallLabel(skill)],
    ])
    const mcpFailure = mcpFailureMessage(mcp)
    if (mcpFailure) note(mcpFailure, 'MCP setup skipped')
    if (skill.error) note(skill.error, 'SEO skill install failed')
    note(next.join('\n'), 'Try next')
    outro('Setup complete.')
    printStarAsk()
    return
  }

  const name =
    stringArg(args.name) ??
    (interactive
      ? maybeExitCancelled(
          await text({
            message: 'Project name',
            placeholder: existingProject?.name ?? defaultName,
            defaultValue: existingProject?.name ?? defaultName,
          }),
        )
      : (existingProject?.name ?? defaultName))
  const id =
    existingProject?.id ??
    (projectTarget.mode === 'create' && projectTarget.requestedId
      ? slugId(projectTarget.requestedId)
      : nextAvailableProjectId(name, clients))
  const defaultStartUrl =
    existingProject?.startUrl ?? startUrlForSite(site) ?? ''
  const startUrl =
    stringArg(args.url) ??
    (interactive
      ? maybeExitCancelled(
          await text({
            message: 'Website URL to crawl',
            placeholder: defaultStartUrl || 'https://example.com',
            defaultValue: defaultStartUrl,
          }),
        )
      : defaultStartUrl || undefined)
  const watchUrls =
    args.urls === undefined
      ? (existingProject?.watchUrls ?? [])
      : listArg(args.urls)
  const analyticsSelection = await chooseAnalyticsForSetup({
    googleProperty: stringArg(args['google-analytics-property']),
    clickySiteId: stringArg(args['clicky-site-id']),
    current: analyticsConnection(existingProject),
    site,
    interactive,
  })
  const googleAnalytics =
    analyticsSelection?.provider === 'google'
      ? analyticsSelection.google
      : undefined
  const clicky =
    analyticsSelection?.provider === 'clicky'
      ? analyticsSelection.clicky
      : undefined
  const derivedBrandTerms =
    existingProject?.brandTerms ?? deriveBrandTerms({ id, name, siteUrl: site })
  const brandTerms =
    args.brand === undefined ? derivedBrandTerms : listArg(args.brand)
  const reportDay =
    numberArg(args['report-day']) ?? existingProject?.reportDay ?? 1
  const technicalWeekday =
    numberArg(args.weekday) ?? existingProject?.technicalWeekday ?? 1
  const isDefault =
    booleanArg(args.default) ?? existingProject?.isDefault ?? true

  const analytics =
    analyticsSelection === undefined
      ? undefined
      : analyticsSelection.provider === 'google'
        ? {
            ...existingProject?.analytics,
            selected: 'google' as const,
            google: { propertyId: analyticsSelection.google.propertyId },
          }
        : analyticsSelection.provider === 'clicky'
          ? {
              ...existingProject?.analytics,
              selected: 'clicky' as const,
              clicky: { siteId: analyticsSelection.clicky.siteId },
            }
          : {}

  const profile = {
    name,
    siteUrl: site,
    startUrl,
    watchUrls,
    brandTerms,
    analytics,
    reportDay,
    technicalWeekday,
    isDefault,
  }
  const client = existingProject
    ? updateClient(existingProject.id, profile)
    : saveClient({ id, ...profile })
  const mcp = await maybeInstallMcp(args)
  const skill = await maybeInstallSkill(args)
  const next = [
    `seo report --project ${client.id}`,
    `seo refresh-priorities --project ${client.id} --verify-content`,
    `seo technical-watch --project ${client.id}`,
  ]
  const result: SetupResult = {
    client,
    site,
    auth,
    googleAnalytics,
    clicky,
    mcp,
    skill,
    next,
  }

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
    [
      'Traffic analytics',
      client.analytics.selected === 'clicky'
        ? `Clicky site ${client.analytics.clicky?.siteId}`
        : client.analytics.google?.propertyId
          ? `Google Analytics property ${client.analytics.google.propertyId}`
          : 'not connected (optional)',
    ],
    ...(googleAnalytics
      ? [
          ['Google Analytics selection', googleAnalytics.reason] as [
            string,
            string,
          ],
        ]
      : []),
    ...(clicky
      ? [
          ['Clicky site', clicky.siteId] as [string, string],
          ['Clicky credential', clicky.credentialSource] as [string, string],
        ]
      : []),
    ['Auth', auth],
    ['MCP', mcpInstallLabel(mcp)],
    ['SEO skill', skillInstallLabel(skill)],
  ])
  const mcpFailure = mcpFailureMessage(mcp)
  if (mcpFailure) note(mcpFailure, 'MCP setup skipped')
  if (skill.error) note(skill.error, 'SEO skill install failed')
  note(next.join('\n'), 'Try next')
  outro('Setup complete.')
  printStarAsk()
}
