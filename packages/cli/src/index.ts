import { rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import {
  cancel,
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
  auditPage,
  authStatus,
  cannibalReport,
  clearCache,
  ctrUnderperformersReport,
  decayingReport,
  deleteTokens,
  ensureSeoCliDirs,
  formatRelativeExpiry,
  ga4RowsToObjects,
  getCacheStats,
  getPrivacySnapshot,
  getSeoCliPaths,
  inspectUrl,
  internalLinksReport,
  listSearchUpdates,
  listSites,
  loginWithLoopback,
  queryClusterReport,
  querySearchAnalytics,
  quickWinsReport,
  readConfig,
  readTokens,
  refreshAuthToken,
  runGa4Report,
  secondPage,
  trafficAnomaly,
  updateCorrelation,
  writeConfig,
  writeOauthClient,
} from '@seo/core'
import { defineCommand, runMain } from 'citty'
import {
  changeLogCommand,
  contentGroupsCommand,
} from './commands/experiments.js'
import {
  detectMcpClients,
  installMcpConfig,
  uninstallMcpConfig,
} from './commands/mcp-config.js'
import { crawlDiffCommand, indexWatchCommand } from './commands/monitoring.js'
import {
  diagnoseCommand,
  doctorCommand,
  ga4PropertiesCommand,
  segmentImpactCommand,
  strikingDistanceCommand,
} from './commands/product.js'
import { resolveGa4Property, resolveSite } from './selection.js'
import {
  formatBytes,
  maybeCheckForUpdates,
  maybeExitCancelled,
  printJson,
  printKeyValue,
  printTable,
} from './utils.js'

const pkg = {
  name: '@seo/cli',
  version: '0.1.0',
}

async function defaultSiteOrThrow(
  site?: string,
  options: { json?: boolean; refresh?: boolean } = {},
): Promise<string> {
  return resolveSite({ site, options })
}

function normalizeJsonFlag(args: Record<string, unknown>): boolean {
  return args.json === true
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function booleanArg(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function numberArg(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function csvArg(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

async function jsonBodyArg(
  value: unknown,
  fileValue: unknown,
): Promise<Record<string, unknown> | undefined> {
  const inline = stringArg(value)
  const file = stringArg(fileValue)
  if (inline && file) {
    throw new Error('Use either --body or --body-file, not both.')
  }
  if (!inline && !file) return undefined
  const source = inline ?? (await readFile(file ?? '', 'utf8'))
  const parsed = JSON.parse(source) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON body must be an object.')
  }
  return parsed as Record<string, unknown>
}

async function output(data: unknown, json = false): Promise<void> {
  if (json) {
    printJson(data)
  } else {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  }
}

const authCommand = defineCommand({
  meta: {
    name: 'auth',
    description: 'Authentication commands',
  },
  subCommands: {
    login: defineCommand({
      meta: { name: 'login', description: 'Run Google OAuth flow' },
      run: async () => {
        const tokens = await loginWithLoopback()
        process.stdout.write(
          `${tokens.account_email} · ${tokens.scope.replace('https://www.googleapis.com/auth/', '')} · ${tokens.client_source === 'shared' ? 'shared seo app' : 'BYO client'}\n`,
        )
      },
    }),
    logout: defineCommand({
      meta: { name: 'logout', description: 'Delete local token file' },
      run: async () => {
        await deleteTokens()
        process.stdout.write(
          'Deleted local tokens.\nRevoke at https://myaccount.google.com/permissions if you also want Google to forget the grant.\n',
        )
      },
    }),
    whoami: defineCommand({
      run: async () => {
        const tokens = await readTokens()
        if (!tokens) {
          process.stdout.write('Not logged in.\n')
          return
        }
        process.stdout.write(
          `${tokens.account_email} · ${tokens.scope.replace('https://www.googleapis.com/auth/', '')} · ${formatRelativeExpiry(tokens.expires_at)} · ${tokens.client_source === 'shared' ? 'shared seo app' : 'BYO client'}\n`,
        )
      },
    }),
    status: defineCommand({
      run: async () => {
        const status = await authStatus()
        if (!status.tokens) {
          const authMode = status.sharedConfigured
            ? 'Shared seo app available'
            : status.byoConfigured
              ? 'BYO client configured'
              : 'No OAuth client configured'
          process.stdout.write(`Not logged in. ${authMode}.\n`)
          return
        }
        printKeyValue([
          ['Account', status.tokens.account_email],
          ['Scopes', status.tokens.scope],
          [
            'Client',
            status.tokens.client_source === 'shared'
              ? 'shared seo app'
              : 'BYO client',
          ],
          ['Expires', formatRelativeExpiry(status.tokens.expires_at)],
          ['Tokens file', getSeoCliPaths().tokensFile],
          [
            'OAuth mode',
            status.sharedConfigured
              ? 'shared app available'
              : status.byoConfigured
                ? 'BYO client configured'
                : 'missing',
          ],
          ['Revoke at', 'https://myaccount.google.com/permissions'],
        ])
      },
    }),
    refresh: defineCommand({
      run: async () => {
        const tokens = await refreshAuthToken()
        process.stdout.write(
          `Refreshed. New expiry ${new Date(tokens.expires_at).toISOString()}.\n`,
        )
      },
    }),
    'setup-client': defineCommand({
      run: async () => {
        intro('seo BYO OAuth client')
        note(
          [
            'This is the advanced path.',
            'Most users should use the shared seo Google app.',
            'Your actual sensitive data is the local refresh token, not the desktop app client secret.',
          ].join('\n'),
          'Advanced',
        )
        const clientId = maybeExitCancelled(
          await text({
            message: 'Google Desktop OAuth client ID',
            validate: (value) => (value ? undefined : 'Client ID is required'),
          }),
        )
        const clientSecret = maybeExitCancelled(
          await password({
            message: 'Google Desktop OAuth client secret',
            validate: (value) =>
              value ? undefined : 'Client secret is required',
          }),
        )
        writeOauthClient({ clientId, clientSecret })
        outro(`Saved BYO OAuth client to ${getSeoCliPaths().oauthClientFile}`)
      },
    }),
  },
})

const cacheCommand = defineCommand({
  meta: { name: 'cache', description: 'Cache helpers' },
  subCommands: {
    stats: defineCommand({
      run: async () => {
        const stats = getCacheStats()
        printKeyValue([
          ['DB', stats.dbPath],
          ['Size', formatBytes(stats.sizeBytes)],
          ['sites', String(stats.counts.sites ?? 0)],
          ['gsc_cache', String(stats.counts.gsc_cache ?? 0)],
          ['semrush_cache', String(stats.counts.semrush_cache ?? 0)],
          ['http_cache', String(stats.counts.http_cache ?? 0)],
        ])
      },
    }),
    clear: defineCommand({
      args: {
        provider: { type: 'string' },
      },
      run: async ({ args }) => {
        const removed = clearCache(
          args.provider as 'gsc' | 'semrush' | 'http' | undefined,
        )
        process.stdout.write(`Removed ${removed} cached rows.\n`)
      },
    }),
  },
})

const mcpCommand = defineCommand({
  meta: { name: 'mcp', description: 'MCP server helpers' },
  subCommands: {
    serve: defineCommand({
      args: {
        test: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const { startMcpServer } = await import('@seo/mcp')
        await startMcpServer({ test: booleanArg(args.test) })
      },
    }),
    install: defineCommand({
      args: {
        uninstall: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const detected = detectMcpClients()
        const selected = maybeExitCancelled(
          await multiselect({
            message: args.uninstall
              ? 'Remove seo from which MCP clients?'
              : 'Install seo into which MCP clients?',
            options: detected.map((target) => ({
              value: target.client,
              label: target.client,
              hint: target.path,
            })),
            initialValues: detected.map((target) => target.client),
            required: true,
          }),
        )

        for (const target of detected.filter((entry) =>
          selected.includes(entry.client),
        )) {
          const result = args.uninstall
            ? uninstallMcpConfig(target)
            : installMcpConfig(target)
          process.stdout.write(
            `${result.changed ? 'updated' : 'skipped'} ${result.client} · ${result.path}\n`,
          )
        }
      },
    }),
  },
})

const main = defineCommand({
  meta: {
    name: 'seo',
    version: pkg.version,
    description: 'Local-first SEO CLI and MCP server',
  },
  subCommands: {
    init: defineCommand({
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
            const targets = maybeExitCancelled(
              await multiselect({
                message: 'Which clients?',
                options: detected.map((target) => ({
                  value: target.client,
                  label: target.client,
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

        outro('Init complete. Try `seo audit-page --url https://example.com`.')
      },
    }),
    auth: authCommand,
    mcp: mcpCommand,
    doctor: doctorCommand,
    'ga4-properties': ga4PropertiesCommand,
    privacy: defineCommand({
      run: async () => {
        const snapshot = getPrivacySnapshot()
        const stats = getCacheStats()
        printKeyValue(
          snapshot.map((item) => [
            item.label,
            `${item.path} · ${formatBytes(item.sizeBytes)} · ${item.mode}`,
          ]),
        )
        process.stdout.write('\n')
        printKeyValue(
          Object.entries(stats.counts).map(([key, value]) => [
            key,
            String(value),
          ]),
        )
      },
    }),
    reset: defineCommand({
      args: {
        yes: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const paths = getSeoCliPaths()
        const approved =
          args.yes ||
          maybeExitCancelled(
            await confirm({
              message: 'Delete config, tokens, cache, and logs?',
              initialValue: false,
            }),
          )
        if (!approved) {
          cancel('Reset aborted.')
          return
        }
        rmSync(paths.configDir, { recursive: true, force: true })
        rmSync(paths.cacheDir, { recursive: true, force: true })
        rmSync(paths.logDir, { recursive: true, force: true })
        process.stdout.write('Reset complete.\n')
      },
    }),
    cache: cacheCommand,
    'change-log': changeLogCommand,
    'content-groups': contentGroupsCommand,
    'crawl-diff': crawlDiffCommand,
    diagnose: diagnoseCommand,
    'index-watch': indexWatchCommand,
    'segment-impact': segmentImpactCommand,
    'striking-distance': strikingDistanceCommand,
    sites: defineCommand({
      args: {
        json: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const sites = await listSites(booleanArg(args.refresh))
        if (normalizeJsonFlag(args)) {
          printJson({ sites })
          return
        }
        printTable(
          ['Property', 'Permission'],
          sites.map((site) => [
            site.siteUrl,
            site.permissionLevel ?? 'unknown',
          ]),
        )
      },
    }),
    'gsc-query': defineCommand({
      args: {
        site: { type: 'string' },
        'start-date': { type: 'string' },
        'end-date': { type: 'string' },
        dimensions: { type: 'string' },
        type: { type: 'string' },
        limit: { type: 'string' },
        body: { type: 'string' },
        'body-file': { type: 'string' },
        json: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const body =
          (await jsonBodyArg(args.body, args['body-file'])) ??
          ({
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
            dimensions: csvArg(args.dimensions) ?? ['query', 'page'],
            type: stringArg(args.type) ?? 'web',
            rowLimit: numberArg(args.limit),
            dataState: 'final',
          } as Record<string, unknown>)
        const json = normalizeJsonFlag(args)
        const site = await defaultSiteOrThrow(
          stringArg(args.site) ?? stringArg(body.siteUrl),
          { json, refresh: booleanArg(args.refresh) },
        )
        delete body.siteUrl
        const result = await querySearchAnalytics(site, body as never, {
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson({ site, request: body, ...result })
          return
        }
        printKeyValue([
          ['Property', site],
          ['Rows', String(result.rows.length)],
          ['API calls', String(result.calls)],
        ])
        printTable(
          ['Keys', 'Clicks', 'Impr', 'CTR', 'Pos'],
          result.rows
            .slice(0, 25)
            .map((row) => [
              row.keys.join(' | '),
              Math.round(row.clicks),
              Math.round(row.impressions),
              row.ctr.toFixed(3),
              row.position.toFixed(1),
            ]),
        )
      },
    }),
    'url-inspect': defineCommand({
      args: {
        site: { type: 'string' },
        url: { type: 'string' },
        language: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        const siteUrl = await defaultSiteOrThrow(stringArg(args.site), { json })
        const inspectionUrl = stringArg(args.url)
        if (!inspectionUrl) throw new Error('Pass --url.')
        const result = await inspectUrl({
          siteUrl,
          inspectionUrl,
          languageCode: stringArg(args.language),
        })
        if (json) {
          printJson(result)
          return
        }
        const indexStatus = result.inspectionResult?.indexStatusResult
        printKeyValue([
          ['Property', siteUrl],
          ['URL', inspectionUrl],
          ['Verdict', indexStatus?.verdict ?? 'unknown'],
          ['Coverage', indexStatus?.coverageState ?? 'unknown'],
          ['Robots', indexStatus?.robotsTxtState ?? 'unknown'],
          ['Last crawl', indexStatus?.lastCrawlTime ?? 'unknown'],
          ['Google canonical', indexStatus?.googleCanonical ?? 'unknown'],
        ])
      },
    }),
    'ga4-report': defineCommand({
      args: {
        property: {
          type: 'string',
          description: 'GA4 property ID. If omitted in a terminal, choose one.',
        },
        'start-date': { type: 'string', default: '28daysAgo' },
        'end-date': { type: 'string', default: 'yesterday' },
        dimensions: { type: 'string', default: 'landingPage' },
        metrics: { type: 'string', default: 'sessions,totalUsers,eventCount' },
        limit: { type: 'string', default: '25' },
        body: { type: 'string' },
        'body-file': { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        const property = await resolveGa4Property({
          property: stringArg(args.property),
          options: { json },
        })
        const body =
          (await jsonBodyArg(args.body, args['body-file'])) ??
          ({
            dateRanges: [
              {
                startDate: stringArg(args['start-date']),
                endDate: stringArg(args['end-date']),
              },
            ],
            dimensions: (csvArg(args.dimensions) ?? []).map((name) => ({
              name,
            })),
            metrics: (csvArg(args.metrics) ?? []).map((name) => ({ name })),
            limit: stringArg(args.limit),
          } as Record<string, unknown>)
        const result = await runGa4Report(property, body as never)
        if (json) {
          printJson(result)
          return
        }
        const rows = ga4RowsToObjects(result)
        printKeyValue([
          ['Property', property],
          ['Rows', String(result.rowCount ?? rows.length)],
        ])
        if (rows.length) {
          const headings = Object.keys(rows[0] ?? {})
          printTable(
            headings,
            rows
              .slice(0, 25)
              .map((row) => headings.map((heading) => row[heading] ?? '')),
          )
        }
      },
    }),
    updates: defineCommand({
      args: {
        product: { type: 'string', default: 'Ranking' },
        limit: { type: 'string', default: '10' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const updates = await listSearchUpdates({
          product: stringArg(args.product),
          limit: numberArg(args.limit),
        })
        if (normalizeJsonFlag(args)) {
          printJson({ updates })
          return
        }
        printTable(
          ['Start', 'End', 'Type', 'Name', 'Status'],
          updates.map((update) => [
            update.start.slice(0, 10),
            update.end?.slice(0, 10) ?? 'open',
            update.type,
            update.name,
            update.status,
          ]),
        )
      },
    }),
    'traffic-anomaly': defineCommand({
      args: {
        site: { type: 'string' },
        days: { type: 'string' },
        recent: { type: 'string' },
        json: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        const report = await trafficAnomaly({
          site: await defaultSiteOrThrow(stringArg(args.site), {
            json,
            refresh: booleanArg(args.refresh),
          }),
          days: numberArg(args.days),
          recentDays: numberArg(args.recent),
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }
        printTable(
          ['Metric', 'Direction', 'Baseline', 'Recent', 'z', 'Significant'],
          report.anomalies.map((anomaly) => [
            anomaly.metric,
            anomaly.direction,
            anomaly.baselineMean,
            anomaly.comparisonMean,
            anomaly.zScore,
            anomaly.significant ? 'yes' : 'no',
          ]),
        )
      },
    }),
    'update-correlate': defineCommand({
      args: {
        site: { type: 'string' },
        days: { type: 'string' },
        recent: { type: 'string' },
        json: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        const report = await updateCorrelation({
          site: await defaultSiteOrThrow(stringArg(args.site), {
            json,
            refresh: booleanArg(args.refresh),
          }),
          days: numberArg(args.days),
          recentDays: numberArg(args.recent),
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }
        printKeyValue([
          ['Classification', report.classification],
          ['Updates matched', String(report.overlappingUpdates.length)],
        ])
        printTable(
          ['Metric', 'Direction', 'z', 'Recent'],
          report.anomalies.map((anomaly) => [
            anomaly.metric,
            anomaly.direction,
            anomaly.zScore,
            `${anomaly.comparisonStart} to ${anomaly.comparisonEnd}`,
          ]),
        )
        if (report.overlappingUpdates.length) {
          process.stdout.write('\nUpdates\n')
          printTable(
            ['Start', 'End', 'Type', 'Name'],
            report.overlappingUpdates.map((update) => [
              update.start.slice(0, 10),
              update.end?.slice(0, 10) ?? 'open',
              update.type,
              update.name,
            ]),
          )
        }
      },
    }),
    'audit-page': defineCommand({
      args: {
        url: { type: 'string', required: true },
        site: { type: 'string' },
        json: { type: 'boolean', default: false },
        js: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const report = await auditPage({
          url: stringArg(args.url) ?? '',
          site: stringArg(args.site) ?? readConfig().defaultSite,
          js: booleanArg(args.js) ? true : 'auto',
          refresh: booleanArg(args.refresh),
        })
        if (normalizeJsonFlag(args)) {
          printJson(report)
          return
        }
        printKeyValue([
          ['URL', report.url],
          ['Final URL', report.page.finalUrl],
          ['Title', report.page.title ?? 'missing'],
          ['Meta description', report.page.metaDescription ?? 'missing'],
          ['Word count', String(report.page.wordCount)],
        ])
        if (report.issues.length) {
          process.stdout.write('\nIssues\n')
          printTable(
            ['Code', 'Severity', 'Principle', 'Detail'],
            report.issues.map((issue) => [
              issue.code,
              issue.severity,
              issue.principle,
              issue.detail,
            ]),
          )
        }
      },
    }),
    'second-page': defineCommand({
      args: {
        site: { type: 'string' },
        limit: { type: 'string' },
        json: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        const report = await secondPage({
          site: await defaultSiteOrThrow(stringArg(args.site), {
            json,
            refresh: booleanArg(args.refresh),
          }),
          limit: stringArg(args.limit) ? Number(stringArg(args.limit)) : 10,
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }
        printTable(
          ['Query', 'Pos', 'Impr', 'CTR', 'Coverage', 'Action'],
          report.items.map((item) => [
            item.primaryQuery,
            item.position.toFixed(1),
            Math.round(item.impressions),
            item.ctr.toFixed(3),
            `${item.coverage.inTitleExact ? 'T' : '-'}${item.coverage.inH1 ? 'H' : '-'}${item.coverage.inMeta ? 'M' : '-'}${item.coverage.inFirst100Words ? 'F' : '-'}`,
            item.recommendations[0]?.action ?? 'No recommendation',
          ]),
        )
        process.stdout.write(`${report.ledgerSummary}\n`)
      },
    }),
    cannibal: defineCommand({
      args: {
        site: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        await output(
          await cannibalReport({
            site: await defaultSiteOrThrow(stringArg(args.site), { json }),
          }),
          json,
        )
      },
    }),
    decaying: defineCommand({
      args: {
        site: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        await output(
          await decayingReport({
            site: await defaultSiteOrThrow(stringArg(args.site), { json }),
          }),
          json,
        )
      },
    }),
    'quick-wins': defineCommand({
      args: {
        site: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        await output(
          await quickWinsReport({
            site: await defaultSiteOrThrow(stringArg(args.site), { json }),
          }),
          json,
        )
      },
    }),
    'internal-links': defineCommand({
      args: {
        site: { type: 'string' },
        url: { type: 'string', required: true },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        await output(
          await internalLinksReport({
            site: await defaultSiteOrThrow(stringArg(args.site), { json }),
            targetUrl: stringArg(args.url) ?? '',
          }),
          json,
        )
      },
    }),
    'ctr-underperformers': defineCommand({
      args: {
        site: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        await output(
          await ctrUnderperformersReport({
            site: await defaultSiteOrThrow(stringArg(args.site), { json }),
          }),
          json,
        )
      },
    }),
    'query-cluster': defineCommand({
      args: {
        site: { type: 'string' },
        scope: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = normalizeJsonFlag(args)
        await output(
          await queryClusterReport({
            site: await defaultSiteOrThrow(stringArg(args.site), { json }),
            scope: stringArg(args.scope),
          }),
          json,
        )
      },
    }),
  },
  run: async () => {
    if (process.argv.slice(2).length === 0) {
      process.stdout.write('Use `seo init` to get started.\n')
    }
  },
})

maybeCheckForUpdates(pkg)
await runMain(main)
