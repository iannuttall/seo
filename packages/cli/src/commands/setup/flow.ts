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
import { maybeExitCancelled, printJson, printKeyValue } from '../../utils.js'
import { slugId, startUrlForSite, suggestedClientName } from '../shared.js'
import {
  canPrompt,
  chooseGa4Property,
  maybeConnectAuth,
  maybeInstallMcp,
  type SetupAuthStatus,
  type SetupMcpInstall,
} from './prompts.js'

type SetupResult = {
  client: ClientProfile
  auth: SetupAuthStatus
  mcp: SetupMcpInstall[]
  next: string[]
}

export async function runGuidedSetup(
  args: Record<string, unknown>,
): Promise<void> {
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
  const defaultName = suggestedClientName(site)

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
            placeholder: slugId(name),
            defaultValue: slugId(name),
          }),
        )
      : slugId(name))
  const defaultStartUrl = startUrlForSite(site) ?? ''
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
    listArg(args.urls).length > 0
      ? listArg(args.urls)
      : canPrompt()
        ? listArg(
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
    listArg(args.brand).length > 0
      ? listArg(args.brand)
      : canPrompt()
        ? listArg(
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
