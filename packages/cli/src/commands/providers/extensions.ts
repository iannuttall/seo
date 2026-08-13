import { confirm, intro, note, outro, password, text } from '@clack/prompts'
import {
  deleteProviderExtensionAccount,
  deleteProviderExtensionCredentials,
  describeInstalledProviderExtension,
  getProviderSpendLimits,
  getProviderSpendSummary,
  inspectProviderPackage,
  installProviderPackage,
  listInstalledProviderExtensions,
  loadInstalledProviderExtensions,
  readProviderExtensionAccount,
  readProviderExtensionCredentials,
  runProviderExtensionAction,
  SeoError,
  type SeoProviderJson,
  setProviderSpendLimits,
  uninstallProviderExtension,
  verifyProviderExtension,
  writeProviderExtensionAccount,
  writeProviderExtensionCredentials,
} from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../args.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
  printTable,
} from '../../utils.js'
import { boundedIntegerArg, formatUsd, usdMicrosArg } from './shared.js'

function parseAccount(value: string | undefined): Record<string, string> {
  if (!value) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SeoError('INVALID_INPUT', '--account must be a JSON object.')
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new SeoError('INVALID_INPUT', '--account must be a JSON object.')
  }
  const entries = Object.entries(parsed)
  if (
    entries.length > 20 ||
    entries.some(
      ([key, item]) =>
        !key ||
        key.length > 64 ||
        typeof item !== 'string' ||
        item.length > 4_096,
    )
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      '--account must contain at most 20 bounded string fields.',
    )
  }
  return Object.fromEntries(
    entries.map(([key, item]) => [key, (item as string).trim()]),
  )
}

function parseActionParams(
  value: string | undefined,
): Record<string, SeoProviderJson> {
  if (!value) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SeoError('INVALID_INPUT', '--params must be a JSON object.')
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new SeoError('INVALID_INPUT', '--params must be a JSON object.')
  }
  const entries = Object.entries(parsed)
  if (
    entries.length > 100 ||
    entries.some(([key]) => !/^[A-Za-z][A-Za-z0-9-]{0,63}$/u.test(key)) ||
    Buffer.byteLength(value) > 64 * 1_024
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      '--params must be a JSON object smaller than 64 KiB.',
    )
  }
  return Object.fromEntries(entries) as Record<string, SeoProviderJson>
}

async function installedProvider(id: string) {
  const loaded = await loadInstalledProviderExtensions()
  const provider = loaded.registry.get(id)
  if (provider) return provider
  const failure = loaded.failures.find((item) => item.id === id)
  if (failure) {
    throw new SeoError(
      'INVALID_INPUT',
      `Provider ${id} could not load: ${failure.message}`,
    )
  }
  throw new SeoError('INVALID_INPUT', `Provider ${id} is not installed.`)
}

function normalizedAccount(
  provider: Awaited<ReturnType<typeof installedProvider>>,
  account: Readonly<Record<string, string>>,
): Record<string, string> {
  const allowed = new Set(
    provider.connection.fields
      .filter((field) => field.kind === 'account')
      .map((field) => field.id),
  )
  const unknown = Object.keys(account).find((key) => !allowed.has(key))
  if (unknown) {
    throw new SeoError(
      'INVALID_INPUT',
      `${unknown} is not an account field for ${provider.displayName}.`,
    )
  }
  const normalized = provider.connection.normalizeAccount
    ? provider.connection.normalizeAccount(account)
    : { ...account }
  const unknownNormalized = Object.keys(normalized).find(
    (key) => !allowed.has(key),
  )
  if (unknownNormalized) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${provider.displayName} returned an unknown account field.`,
    )
  }
  for (const field of provider.connection.fields.filter(
    (item) => item.kind === 'account' && item.required !== false,
  )) {
    if (!normalized[field.id]?.trim()) {
      throw new SeoError('INVALID_INPUT', `${field.label} is required.`)
    }
  }
  return normalized
}

export async function providerExtensionInventory() {
  return listInstalledProviderExtensions()
}

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List installed provider packages',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const inventory = await providerExtensionInventory()
    if (jsonFlag(args)) {
      printJson(inventory)
      return
    }
    if (inventory.installed.length > 0) {
      printTable(
        ['Installed provider', 'Package', 'Version', 'Status'],
        inventory.installed.map((provider) => [
          provider.id,
          provider.package,
          provider.version,
          provider.loadStatus,
        ]),
      )
    } else {
      process.stdout.write('No provider extensions are installed.\n')
    }
  },
})

const describeCommand = defineCommand({
  meta: {
    name: 'describe',
    description: 'Describe one installed provider for an agent',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const result = await describeInstalledProviderExtension(id)
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Provider', result.displayName],
      ['Package', `${result.package}@${result.version}`],
      ['Description', result.description],
      [
        'Capabilities',
        result.capabilities.map((item) => item.id).join(', ') || 'none',
      ],
      ['Actions', result.actions.map((item) => item.id).join(', ') || 'none'],
    ])
  },
})

const installCommand = defineCommand({
  meta: {
    name: 'install',
    description: 'Install one provider package from npm',
  },
  args: {
    package: {
      type: 'positional',
      required: true,
      description: 'npm package name with an optional exact version.',
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Approve third-party code installation without prompting.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const packageName = stringArg(args.package) ?? ''
    const json = jsonFlag(args)
    const approved = booleanArg(args.yes)
    const interactive = canPrompt({ json })
    if (!approved && !interactive) {
      throw new SeoError(
        'INVALID_INPUT',
        'Provider installation runs third-party code. Review the package, then pass --yes to approve it in JSON or CI mode.',
      )
    }
    let release: Awaited<ReturnType<typeof inspectProviderPackage>>
    try {
      release = await inspectProviderPackage(packageName)
    } catch (error) {
      throw new SeoError(
        'INVALID_INPUT',
        error instanceof Error ? error.message : String(error),
      )
    }
    if (!approved) {
      intro('Install provider package')
      note(
        [
          `${release.package}@${release.version}`,
          `Publisher: ${release.publisher ?? 'not supplied by npm'}`,
          `Repository: ${release.repository ?? 'not supplied by npm'}`,
          `Integrity: ${release.integrity}`,
        ].join('\n'),
        'Package',
      )
      note(
        'This package can read files, use the network, and run with the same local permissions as seo. Installing it is not a security review or endorsement.',
        'Third-party code',
      )
      const accepted = maybeExitCancelled(
        await confirm({
          message: `Install ${release.package}@${release.version}?`,
          initialValue: false,
        }),
      )
      if (!accepted) {
        outro('Provider was not installed.')
        return
      }
    }
    let installed: Awaited<ReturnType<typeof installProviderPackage>>
    try {
      installed = await installProviderPackage(release)
    } catch (error) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        error instanceof Error ? error.message : String(error),
      )
    }
    const result = { installed, package: release }
    if (json) {
      printJson(result)
      return
    }
    outro(
      `Installed provider ${installed.id} from ${installed.package}@${installed.version}.`,
    )
  },
})

const removeCommand = defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove one installed provider extension',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Remove the package without prompting.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const json = jsonFlag(args)
    const approved = booleanArg(args.yes)
    const interactive = canPrompt({ json })
    if (!approved && !interactive) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass --yes to remove a provider extension in JSON or CI mode.',
      )
    }
    if (!approved) {
      const accepted = maybeExitCancelled(
        await confirm({
          message: `Remove provider ${id}?`,
          initialValue: false,
        }),
      )
      if (!accepted) return
    }
    const removed = await uninstallProviderExtension(id)
    if (!removed) {
      throw new SeoError('INVALID_INPUT', `Provider ${id} is not installed.`)
    }
    if (json) {
      printJson({ removed })
      return
    }
    process.stdout.write(`Removed ${id}.\n`)
  },
})

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Validate and save one installed provider connection',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    account: {
      type: 'string',
      description:
        'Account fields as JSON. Secret fields must use their environment variables.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const json = jsonFlag(args)
    const interactive = canPrompt({ json })
    const provider = await installedProvider(id)
    let account = {
      ...readProviderExtensionAccount(id),
      ...parseAccount(stringArg(args.account)),
    }
    const enteredCredentials: Record<string, string> = {}

    if (interactive) {
      intro(`Connect ${provider.displayName}`)
      if (provider.connection.verificationNotice) {
        note(provider.connection.verificationNotice, 'Connection check')
      }
      for (const field of provider.connection.fields) {
        if (field.kind === 'account') {
          const value = maybeExitCancelled(
            await text({
              message: field.label,
              placeholder: field.description,
              initialValue: account[field.id],
              validate: (item) =>
                field.required !== false && !item?.trim()
                  ? `${field.label} is required`
                  : undefined,
            }),
          )
          if (value?.trim()) account[field.id] = value.trim()
          continue
        }
        if (field.envVar && process.env[field.envVar]?.trim()) continue
        const value = maybeExitCancelled(
          await password({
            message: field.label,
            validate: (item) =>
              field.required !== false && !item?.trim()
                ? `${field.label} is required`
                : undefined,
          }),
        )
        if (value?.trim()) enteredCredentials[field.id] = value.trim()
      }
    }

    account = normalizedAccount(provider, account)
    let credentials = { ...enteredCredentials }
    if (Object.keys(credentials).length === 0) {
      credentials = await readProviderExtensionCredentials({
        providerId: id,
        account,
        fields: provider.connection.fields,
      })
    }
    await verifyProviderExtension({ providerId: id, account, credentials })
    if (Object.keys(enteredCredentials).length > 0) {
      await writeProviderExtensionCredentials({
        providerId: id,
        account,
        credentials: enteredCredentials,
      })
    }
    writeProviderExtensionAccount(id, account)
    const result = {
      provider: id,
      connected: true,
      account,
      capabilities: (provider.capabilities ?? []).map((item) => item.id),
      actions: (provider.actions ?? []).map((item) => item.id),
    }
    if (json) printJson(result)
    else
      outro(
        `Connected ${provider.displayName}. Run seo providers describe ${id} to see what it can do.`,
      )
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show one installed provider connection',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    check: {
      type: 'boolean',
      default: false,
      description: 'Run the provider connection check.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const provider = await installedProvider(id)
    const account = readProviderExtensionAccount(id)
    let credentials: Record<string, string> | undefined
    try {
      credentials = await readProviderExtensionCredentials({
        providerId: id,
        account,
        fields: provider.connection.fields,
      })
    } catch {
      credentials = undefined
    }
    const accountReady = provider.connection.fields
      .filter((field) => field.kind === 'account' && field.required !== false)
      .every((field) => Boolean(account[field.id]?.trim()))
    const connected = accountReady && credentials !== undefined
    const shouldCheck = booleanArg(args.check)
    if (shouldCheck && !connected) {
      throw new SeoError(
        'AUTH_REQUIRED',
        `Provider ${id} is not connected. Run \`seo providers connect ${id}\`.`,
      )
    }
    if (shouldCheck && credentials) {
      await verifyProviderExtension({ providerId: id, account, credentials })
    }
    const result = {
      provider: id,
      installed: true,
      connected,
      account,
      capabilities: (provider.capabilities ?? []).map((item) => item.id),
      actions: (provider.actions ?? []).map((item) => item.id),
      check: shouldCheck ? ('passed' as const) : ('not-requested' as const),
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printTable(
      ['Provider', 'Connected', 'Capabilities', 'Check'],
      [
        [
          provider.displayName,
          connected ? 'yes' : 'no',
          result.capabilities.join(', '),
          result.check,
        ],
      ],
    )
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove one saved provider connection',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    await installedProvider(id)
    const account = readProviderExtensionAccount(id)
    await deleteProviderExtensionCredentials({ providerId: id, account })
    deleteProviderExtensionAccount(id)
    const result = {
      provider: id,
      disconnected: true,
      note: 'Environment variables were not changed.',
    }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`Disconnected ${id}. ${result.note}\n`)
  },
})

const runCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'Run one action supplied by an installed provider',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    action: {
      type: 'positional',
      required: true,
      description: 'Provider action id.',
    },
    account: {
      type: 'string',
      description: 'Account fields as JSON. Defaults to the saved connection.',
    },
    params: {
      type: 'string',
      description: 'Action parameters as a JSON object.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass the local provider cache.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const action = stringArg(args.action) ?? ''
    await installedProvider(id)
    const account = {
      ...readProviderExtensionAccount(id),
      ...parseAccount(stringArg(args.account)),
    }
    const result = await runProviderExtensionAction({
      providerId: id,
      actionId: action,
      account,
      params: parseActionParams(stringArg(args.params)),
      refresh: booleanArg(args.refresh),
    })
    printJson(result)
  },
})

const limitsCommand = defineCommand({
  meta: {
    name: 'limits',
    description: 'Show or change local limits for one installed provider',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    'daily-notice': {
      type: 'string',
      description: 'UTC daily notice in USD, or off.',
    },
    'daily-limit': {
      type: 'string',
      description: 'UTC daily hard limit in USD, or off.',
    },
    'monthly-limit': {
      type: 'string',
      description: 'UTC monthly hard limit in USD, or off.',
    },
    requests: {
      type: 'string',
      description: 'Maximum provider requests in one report run.',
    },
    rows: {
      type: 'string',
      description: 'Maximum requested provider rows in one report run.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    await installedProvider(id)
    const current = getProviderSpendLimits(id)
    const update = {
      dailyNoticeMicros: usdMicrosArg(args['daily-notice'], '--daily-notice', {
        notice: true,
      }),
      dailyHardLimitMicros: usdMicrosArg(args['daily-limit'], '--daily-limit'),
      monthlyHardLimitMicros: usdMicrosArg(
        args['monthly-limit'],
        '--monthly-limit',
      ),
      maxRequestsPerReport: boundedIntegerArg(
        args.requests,
        '--requests',
        1,
        100,
      ),
      maxRowsPerReport: boundedIntegerArg(args.rows, '--rows', 1, 100_000),
    }
    const changed = Object.values(update).some((value) => value !== undefined)
    const limits = changed
      ? setProviderSpendLimits(id, {
          dailyNoticeMicros:
            update.dailyNoticeMicros ?? current.dailyNoticeMicros,
          dailyHardLimitMicros:
            update.dailyHardLimitMicros === undefined
              ? current.dailyHardLimitMicros
              : update.dailyHardLimitMicros,
          monthlyHardLimitMicros:
            update.monthlyHardLimitMicros === undefined
              ? current.monthlyHardLimitMicros
              : update.monthlyHardLimitMicros,
          maxRequestsPerReport:
            update.maxRequestsPerReport ?? current.maxRequestsPerReport,
          maxRowsPerReport: update.maxRowsPerReport ?? current.maxRowsPerReport,
        })
      : current
    const result = { provider: id, changed, limits }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      [
        'UTC daily notice',
        limits.dailyNoticeMicros === 0
          ? 'off'
          : formatUsd(limits.dailyNoticeMicros),
      ],
      [
        'UTC daily hard limit',
        limits.dailyHardLimitMicros === null
          ? 'off'
          : formatUsd(limits.dailyHardLimitMicros),
      ],
      [
        'UTC monthly hard limit',
        limits.monthlyHardLimitMicros === null
          ? 'off'
          : formatUsd(limits.monthlyHardLimitMicros),
      ],
      ['Requests per report', String(limits.maxRequestsPerReport)],
      ['Rows per report', String(limits.maxRowsPerReport)],
    ])
  },
})

const spendCommand = defineCommand({
  meta: {
    name: 'spend',
    description: 'Show locally recorded spend for one installed provider',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Installed provider id.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    await installedProvider(id)
    const result = { provider: id, local: getProviderSpendSummary(id) }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    printKeyValue([
      ['Today', formatUsd(result.local.today.effectiveCostMicros)],
      ['This month', formatUsd(result.local.month.effectiveCostMicros)],
      ['Requests today', String(result.local.today.requests)],
    ])
  },
})

const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Validate installed provider packages and entry points',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const inventory = await providerExtensionInventory()
    const result = {
      ok: inventory.installed.every(
        (provider) => provider.loadStatus === 'ready',
      ),
      installed: inventory.installed,
    }
    if (jsonFlag(args)) {
      printJson(result)
      return
    }
    if (result.installed.length === 0) {
      process.stdout.write('No provider extensions are installed.\n')
      return
    }
    printTable(
      ['Provider', 'Package', 'Version', 'Status'],
      result.installed.map((provider) => [
        provider.id,
        provider.package,
        provider.version,
        provider.error ?? provider.loadStatus,
      ]),
    )
  },
})

export const providerExtensionCommands = {
  list: listCommand,
  describe: describeCommand,
  install: installCommand,
  remove: removeCommand,
  connect: connectCommand,
  status: statusCommand,
  disconnect: disconnectCommand,
  run: runCommand,
  limits: limitsCommand,
  spend: spendCommand,
  doctor: doctorCommand,
}
