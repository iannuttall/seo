import { intro, outro, password, text } from '@clack/prompts'
import {
  analyticsConnection,
  CLICKY_SITEKEY_ENV,
  ClickyClient,
  deleteClickySiteKey,
  readClickySiteKey,
  removeClientAnalyticsConnection,
  SeoError,
  setClientAnalyticsConnection,
  writeClickySiteKey,
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

function credentialSourceLabel(
  source: 'environment' | 'keychain' | 'file' | undefined,
): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  return source ?? 'missing'
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
  throw new SeoError(
    'INVALID_INPUT',
    'No Clicky site is selected. Pass --site-id or use a project connected to Clicky.',
  )
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
    const interactive = canPrompt({ json })
    const requestedProject = projectArg(args)
    const project = requestedProject
      ? await resolveClient({ project: requestedProject, options: { json } })
      : undefined
    if (interactive) intro('Connect Clicky')
    const currentConnection = analyticsConnection(project)
    const siteId =
      stringArg(args['site-id']) ??
      (currentConnection?.provider === 'clicky'
        ? currentConnection.siteId
        : undefined) ??
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
    const existing = await readClickySiteKey(siteId)
    const siteKey =
      existing?.siteKey ??
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
    const clickyClient = new ClickyClient({ siteId, siteKey })
    await clickyClient.verify()
    const verifiedSiteId = clickyClient.siteId
    const source =
      existing?.source ?? (await writeClickySiteKey(verifiedSiteId, siteKey))
    const savedProject = project
      ? setClientAnalyticsConnection(project.id, {
          provider: 'clicky',
          siteId: verifiedSiteId,
        })
      : undefined
    const result = {
      siteId: verifiedSiteId,
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
  meta: {
    name: 'status',
    description: 'Show the local Clicky connection',
  },
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
    const siteId = await resolveClickySiteId({
      siteId: stringArg(args['site-id']),
      project: projectArg(args),
      json,
    })
    const credential = await readClickySiteKey(siteId)
    const check = booleanArg(args.check)
    if (check && credential) await new ClickyClient({ siteId }).verify()
    const result = {
      siteId,
      connected: Boolean(credential),
      credentialSource: credential?.source,
      liveCheck: check
        ? credential
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
    const siteId = await resolveClickySiteId({
      siteId: stringArg(args['site-id']),
      project: projectArg(args),
      json,
    })
    const result = await new ClickyClient({ siteId }).report({
      type: stringArg(args.type) ?? 'pages-entrance',
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
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
        .map((row) => [row.value ?? '', row.title ?? '', row.url ?? '']),
    )
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove a saved Clicky sitekey',
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
    const siteId = await resolveClickySiteId({
      siteId: stringArg(args['site-id']),
      project: projectArg(args),
      json,
    })
    await deleteClickySiteKey(siteId)
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
    if (!project?.analytics.clicky) {
      throw new SeoError(
        'INVALID_INPUT',
        'The selected project is not attached to Clicky.',
      )
    }
    const updated = removeClientAnalyticsConnection(project.id, 'clicky')
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
