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
  ensureSeoCliDirs,
  getSeoCliPaths,
  listSites,
  loginWithLoopback,
  readConfig,
  writeConfig,
  writeOauthClient,
} from '@seo/core'
import { defineCommand } from 'citty'
import { maybeExitCancelled } from '../utils.js'
import { detectMcpClients } from './mcp-clients.js'
import { installMcpConfig } from './mcp-config.js'

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description:
      'Initialise local seo config and connect Google Search Console',
  },
  args: {
    yes: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    ensureSeoCliDirs()
    intro('seo init')
    const status = await authStatus()
    note(
      [
        'No data leaves your machine.',
        `Config: ${getSeoCliPaths().configDir}`,
        `Tokens: ${getSeoCliPaths().tokensFile}`,
        `Cache: ${getSeoCliPaths().cacheDbFile}`,
        'Scope: https://www.googleapis.com/auth/webmasters.readonly',
        status.sharedConfigured
          ? 'Default sign-in uses the shared seo Google app. Tokens are still stored locally on your machine.'
          : 'This local checkout does not include the shared seo Google app, so auth needs BYO client credentials or env vars.',
      ].join('\n'),
      'Privacy',
    )

    if (args['dry-run']) {
      outro('Dry run complete.')
      return
    }

    if (!status.tokens) {
      const loginChoice = args.yes
        ? status.sharedConfigured
          ? 'shared'
          : 'setup'
        : maybeExitCancelled(
            await select({
              message: status.sharedConfigured
                ? 'Connect Google Search Console now?'
                : 'No shared seo Google app is configured in this checkout.',
              options: status.sharedConfigured
                ? [
                    {
                      value: 'shared',
                      label: 'Use shared seo Google app',
                      hint: 'Recommended',
                    },
                    {
                      value: 'setup',
                      label: 'Use my own Google OAuth client',
                      hint: 'Advanced',
                    },
                    { value: 'skip', label: 'Skip for now' },
                  ]
                : [
                    {
                      value: 'setup',
                      label: 'Set up my own Google OAuth client',
                      hint: 'Advanced but required in this local checkout',
                    },
                    { value: 'skip', label: 'Skip for now' },
                  ],
            }),
          )

      if (loginChoice === 'setup') {
        note(
          [
            'This path is mainly for corporate or locked-down environments.',
            'The default product path is the shared seo Google app.',
          ].join('\n'),
          'BYO client',
        )
        const clientId = maybeExitCancelled(
          await text({ message: 'Google Desktop OAuth client ID' }),
        )
        const clientSecret = maybeExitCancelled(
          await password({ message: 'Google Desktop OAuth client secret' }),
        )
        writeOauthClient({ clientId, clientSecret })
      }

      if (loginChoice !== 'skip') {
        await loginWithLoopback()
      }
    }

    const config = readConfig()
    const sites = await listSites().catch(() => [])
    if (sites.length) {
      const defaultSite = args.yes
        ? (sites[0]?.siteUrl ?? '')
        : maybeExitCancelled(
            await select({
              message: 'Choose your default Search Console property',
              options: sites.map((site) => ({
                value: site.siteUrl,
                label: site.siteUrl,
                hint: site.permissionLevel,
              })),
            }),
          )
      config.defaultSite = defaultSite
      config.sites = sites.map((site, index) => ({
        siteUrl: site.siteUrl,
        displayName: site.siteUrl,
        permission: site.permissionLevel,
        isDefault:
          site.siteUrl === defaultSite || (!defaultSite && index === 0),
        addedAt: Date.now(),
      }))
    }

    const providerChoice = args.yes
      ? 'skip'
      : maybeExitCancelled(
          await select({
            message: 'Add a keyword data provider?',
            options: [
              { value: 'skip', label: 'Skip for now' },
              { value: 'semrush', label: 'Semrush API key' },
              { value: 'dataforseo', label: 'DataForSEO login/password' },
            ],
          }),
        )

    if (providerChoice === 'semrush') {
      config.providers.semrushApiKey = maybeExitCancelled(
        await password({ message: 'Semrush API key' }),
      )
      config.providers.prefer = 'authoritative'
    }

    if (providerChoice === 'dataforseo') {
      config.providers.dataForSeoLogin = maybeExitCancelled(
        await text({ message: 'DataForSEO login' }),
      )
      config.providers.dataForSeoPassword = maybeExitCancelled(
        await password({ message: 'DataForSEO password' }),
      )
      config.providers.prefer = 'cheap'
    }

    writeConfig(config)

    if (!args.yes) {
      const installMcp = maybeExitCancelled(
        await confirm({
          message: 'Install as an MCP server too?',
          initialValue: true,
        }),
      )
      if (installMcp) {
        const detected = detectMcpClients()
        if (detected.length === 0) {
          note(
            'No supported MCP client was detected. Run `seo mcp install` later.',
          )
        } else {
          const targets = maybeExitCancelled(
            await multiselect({
              message: 'Which clients?',
              options: detected.map((target) => ({
                value: target.client,
                label: target.label,
                hint: target.path,
              })),
              initialValues: detected.map((target) => target.client),
            }),
          )
          for (const target of detected.filter((entry) =>
            targets.includes(entry.client),
          )) {
            installMcpConfig(target)
          }
        }
      }
    }

    outro('Init complete. Try `seo audit-page --url https://example.com`.')
  },
})
