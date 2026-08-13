import { confirm, intro, note, outro, password, text } from '@clack/prompts'
import {
  analyticsConnection,
  CLICKY_SITEKEY_ENV,
  deleteClickySiteKey,
  deleteProviderExtensionCredentials,
  inspectProviderPackage,
  installProviderPackage,
  loadInstalledProviderExtensions,
  type RegisteredProviderExtension,
  readClickySiteKey,
  readProviderExtensionCredentials,
  removeClientAnalyticsConnection,
  runProviderExtensionAction,
  SeoError,
  setClientAnalyticsConnection,
  verifyAnalyticsProvider,
  writeClickySiteKey,
  writeProviderExtensionAccount,
  writeProviderExtensionCredentials,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../../args.js'
import { resolveClient } from '../../../selection.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
  printTable,
} from '../../../utils.js'

const CLICKY_PROVIDER_PACKAGE = '@seoskill/clicky-provider'

function credentialSourceLabel(source: string | undefined): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  if (source === 'provider-store') return 'provider credential store'
  return source ?? 'missing'
}

async function clickyProvider(input: {
  json?: boolean
}): Promise<RegisteredProviderExtension> {
  let loaded = await loadInstalledProviderExtensions()
  const installed = loaded.registry.get('clicky')
  if (installed) return installed
  const failure = loaded.failures.find((item) => item.id === 'clicky')
  if (failure) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `The Clicky provider package could not load: ${failure.message}`,
    )
  }
  const interactive = canPrompt({ json: input.json })
  if (!interactive) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `Clicky is now an optional provider package. Run \`seo providers install ${CLICKY_PROVIDER_PACKAGE} --yes\`, then run this command again.`,
    )
  }
  let release: Awaited<ReturnType<typeof inspectProviderPackage>>
  try {
    release = await inspectProviderPackage(CLICKY_PROVIDER_PACKAGE)
  } catch (error) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      error instanceof Error ? error.message : String(error),
    )
  }
  note(
    [
      `${release.package}@${release.version}`,
      `Publisher: ${release.publisher ?? 'not supplied by npm'}`,
      `Repository: ${release.repository ?? 'not supplied by npm'}`,
      `Integrity: ${release.integrity}`,
    ].join('\n'),
    'Clicky package',
  )
  note(
    'This package can read files, use the network, and run with the same local permissions as seo.',
    'Local permissions',
  )
  const approved = maybeExitCancelled(
    await confirm({
      message: 'Install the Clicky provider package?',
      initialValue: true,
    }),
  )
  if (!approved) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The Clicky provider package is required for this command.',
    )
  }
  await installProviderPackage(release)
  loaded = await loadInstalledProviderExtensions()
  const provider = loaded.registry.get('clicky')
  if (!provider) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The Clicky provider package was installed but could not load. Run `seo providers doctor`.',
    )
  }
  return provider
}

async function resolveClickySiteId(input: {
  siteId?: string
  project?: string
  json?: boolean
}): Promise<string> {
  if (input.siteId) return input.siteId
  const client = await resolveClient({
    client: input.project,
    options: { json: input.json },
  })
  const connection = analyticsConnection(client)
  if (connection?.provider === 'clicky') return connection.siteId
  if (
    connection?.provider === 'extension' &&
    connection.providerId === 'clicky' &&
    connection.account.siteId
  ) {
    return connection.account.siteId
  }
  throw new SeoError(
    'INVALID_INPUT',
    'No Clicky site is selected. Pass --site-id or use a project connected to Clicky.',
  )
}

async function savedCredentials(
  provider: RegisteredProviderExtension,
  siteId: string,
): Promise<{ siteKey?: string; source?: string }> {
  const legacy = await readClickySiteKey(siteId)
  if (legacy) return { siteKey: legacy.siteKey, source: legacy.source }
  try {
    const credentials = await readProviderExtensionCredentials({
      providerId: 'clicky',
      account: { siteId },
      fields: provider.connection.fields,
    })
    return credentials.sitekey
      ? { siteKey: credentials.sitekey, source: 'provider-store' }
      : {}
  } catch {
    return {}
  }
}

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Validate and save a Clicky sitekey',
  },
  args: {
    'site-id': { type: 'string', description: 'Numeric Clicky site ID.' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const provider = await clickyProvider({ json })
    const interactive = canPrompt({ json })
    const requestedProject = projectArg(args)
    const project = requestedProject
      ? await resolveClient({ project: requestedProject, options: { json } })
      : undefined
    if (interactive) intro('Connect Clicky')
    const currentConnection = analyticsConnection(project)
    const currentSiteId =
      currentConnection?.provider === 'clicky'
        ? currentConnection.siteId
        : currentConnection?.provider === 'extension' &&
            currentConnection.providerId === 'clicky'
          ? currentConnection.account.siteId
          : undefined
    const siteId =
      stringArg(args['site-id']) ??
      currentSiteId ??
      (interactive
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
        'Pass --site-id when the selected project is not already connected to Clicky.',
      )
    }
    const existing = await savedCredentials(provider, siteId)
    const siteKey =
      existing.siteKey ??
      (interactive
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
        `Run this command in a terminal or set ${CLICKY_SITEKEY_ENV}.`,
      )
    }
    await verifyAnalyticsProvider({
      providerId: 'clicky',
      account: { siteId },
      credentials: { sitekey: siteKey },
    })
    const source =
      existing.source ?? (await writeClickySiteKey(siteId, siteKey))
    await writeProviderExtensionCredentials({
      providerId: 'clicky',
      account: { siteId },
      credentials: { sitekey: siteKey },
    })
    writeProviderExtensionAccount('clicky', { siteId })
    const savedProject = project
      ? setClientAnalyticsConnection(project.id, {
          provider: 'extension',
          providerId: 'clicky',
          account: { siteId },
        })
      : undefined
    const result = {
      siteId,
      connected: true,
      credentialSource: source,
      project: savedProject
        ? { id: savedProject.id, name: savedProject.name }
        : undefined,
    }
    if (json) {
      printJson(result)
      return
    }
    const message = savedProject
      ? `Connection verified and attached to ${savedProject.name}. Saved in the ${credentialSourceLabel(source)}.`
      : `Connection verified. Saved in the ${credentialSourceLabel(source)}.`
    if (interactive) outro(message)
    else process.stdout.write(`${message}\n`)
  },
})

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show the local Clicky connection' },
  args: {
    'site-id': { type: 'string', description: 'Numeric Clicky site ID.' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    check: {
      type: 'boolean',
      default: false,
      description: 'Verify the saved sitekey with Clicky.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const provider = await clickyProvider({ json })
    const siteId = await resolveClickySiteId({
      siteId: stringArg(args['site-id']),
      project: projectArg(args),
      json,
    })
    const credential = await savedCredentials(provider, siteId)
    const check = booleanArg(args.check)
    if (check && credential.siteKey) {
      await verifyAnalyticsProvider({
        providerId: 'clicky',
        account: { siteId },
        credentials: { sitekey: credential.siteKey },
      })
    }
    const result = {
      siteId,
      connected: Boolean(credential.siteKey),
      credentialSource: credential.source,
      liveCheck: check
        ? credential.siteKey
          ? ('passed' as const)
          : ('unavailable' as const)
        : ('not-requested' as const),
    }
    if (json) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Site ID', siteId],
      ['Connected', result.connected ? 'yes' : 'no'],
      ['Credential', credentialSourceLabel(result.credentialSource)],
      ['Live check', result.liveCheck],
    ])
  },
})

const reportCommand = defineCommand({
  meta: {
    name: 'report',
    description: 'Run a bounded Clicky analytics report',
  },
  args: {
    'site-id': { type: 'string', description: 'Numeric Clicky site ID.' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    type: {
      type: 'string',
      default: 'pages-entrance',
      description: 'Clicky report type. Defaults to pages-entrance.',
    },
    'start-date': {
      type: 'string',
      required: true,
      description: 'First site calendar date in YYYY-MM-DD format.',
    },
    'end-date': {
      type: 'string',
      required: true,
      description: 'Last site calendar date in YYYY-MM-DD format.',
    },
    limit: {
      type: 'string',
      default: '100',
      description: 'Maximum retained rows. Defaults to 100 and caps at 5000.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass the local Clicky cache.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const provider = await clickyProvider({ json })
    const siteId = await resolveClickySiteId({
      siteId: stringArg(args['site-id']),
      project: projectArg(args),
      json,
    })
    const credential = await savedCredentials(provider, siteId)
    const action = await runProviderExtensionAction({
      providerId: 'clicky',
      actionId: 'report',
      account: { siteId },
      ...(credential.siteKey
        ? { credentials: { sitekey: credential.siteKey } }
        : {}),
      params: {
        type: stringArg(args.type) ?? 'pages-entrance',
        startDate: stringArg(args['start-date']) ?? '',
        endDate: stringArg(args['end-date']) ?? '',
        limit: numberArg(args.limit) ?? 100,
      },
      refresh: booleanArg(args.refresh),
    })
    if (!action.data || typeof action.data !== 'object') {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        'The Clicky provider returned an invalid report.',
      )
    }
    const result = {
      ...(action.data as Record<string, unknown>),
      cache: action.cache,
    } as {
      siteId: string
      type: string
      rows: Array<Record<string, unknown>>
      returnedRows: number
      cache: string
    }
    if (json) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Site ID', result.siteId],
      ['Report', result.type],
      ['Rows', String(result.returnedRows)],
      ['Cache', result.cache],
    ])
    printTable(
      ['Value', 'Title', 'URL'],
      result.rows
        .slice(0, 25)
        .map((row) => [
          String(row.value ?? ''),
          String(row.title ?? ''),
          String(row.url ?? ''),
        ]),
    )
  },
})

const disconnectCommand = defineCommand({
  meta: { name: 'disconnect', description: 'Remove a saved Clicky sitekey' },
  args: {
    'site-id': { type: 'string', description: 'Numeric Clicky site ID.' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    await clickyProvider({ json })
    const siteId = await resolveClickySiteId({
      siteId: stringArg(args['site-id']),
      project: projectArg(args),
      json,
    })
    await deleteClickySiteKey(siteId)
    await deleteProviderExtensionCredentials({
      providerId: 'clicky',
      account: { siteId },
    })
    const environmentCredential = Boolean(process.env[CLICKY_SITEKEY_ENV])
    const result = {
      siteId,
      savedCredentialRemoved: true,
      environmentCredential: environmentCredential ? 'active' : 'missing',
    }
    if (json) printJson(result)
    else
      process.stdout.write(
        environmentCredential
          ? `Saved sitekey removed. ${CLICKY_SITEKEY_ENV} is still active.\n`
          : 'Clicky is disconnected for this site.\n',
      )
  },
})

const detachCommand = defineCommand({
  meta: {
    name: 'detach',
    description: 'Remove Clicky from one project without deleting its sitekey',
  },
  args: {
    project: {
      type: 'string',
      required: true,
      description: 'Saved project id or name.',
    },
    client: { type: 'string', description: 'Legacy alias for --project.' },
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
    const selected = analyticsConnection(project)
    const provider =
      selected?.provider === 'extension' && selected.providerId === 'clicky'
        ? ('extension:clicky' as const)
        : selected?.provider === 'clicky'
          ? ('clicky' as const)
          : undefined
    if (!project || !provider) {
      throw new SeoError(
        'INVALID_INPUT',
        'The selected project is not attached to Clicky.',
      )
    }
    const updated = removeClientAnalyticsConnection(project.id, provider)
    const result = {
      project: { id: updated.id, name: updated.name },
      detached: true,
      selectedAnalytics: updated.analytics.selected,
      savedSitekey: true,
    }
    if (json) printJson(result)
    else
      process.stdout.write(
        `Clicky detached from ${updated.name}. The saved sitekey was kept.\n`,
      )
  },
})

export const clickyAnalyticsCommand = defineCommand({
  meta: {
    name: 'clicky',
    description: 'Connect Clicky and read bounded analytics reports',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    report: reportCommand,
    detach: detachCommand,
    disconnect: disconnectCommand,
  },
})
