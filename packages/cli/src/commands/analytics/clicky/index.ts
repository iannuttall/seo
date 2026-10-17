import { intro, outro, password, text } from '@clack/prompts'
import {
  CLICKY_SITEKEY_ENV,
  deleteClickySiteKey,
  readClickySiteKey,
  SeoError,
  writeClickySiteKey,
} from '@seo/core'
import {
  ClickyError,
  clickyDomain,
  isClickySiteId,
  isClickySitekey,
} from '@seo/core/commands'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../../args.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printKeyValue,
} from '../../../utils.js'

// Clicky sites saved on this machine only. `seo data --source clicky` reads
// them by site ID. Sites saved on the seoskill.dev account need no command
// here; `seo login` brings them in.

function credentialSourceLabel(source: string | undefined): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  if (source === 'environment') return CLICKY_SITEKEY_ENV
  return source ?? 'missing'
}

function requireClickySiteId(siteId: string | undefined): string {
  if (siteId && isClickySiteId(siteId)) return siteId.trim()
  throw new SeoError(
    'INVALID_INPUT',
    'No Clicky site given. Pass --site-id with the numeric Clicky site ID.',
  )
}

// Checks the site ID and sitekey with Clicky and returns the site's domain.
async function verify(siteId: string, sitekey: string) {
  return clickyDomain({ siteId, sitekey }).catch((error: unknown) => {
    throw new SeoError(
      error instanceof ClickyError && error.code === 'auth'
        ? 'AUTH_REQUIRED'
        : 'PROVIDER_UNAVAILABLE',
      error instanceof Error ? error.message : String(error),
    )
  })
}

const json = {
  type: 'boolean',
  default: false,
  description: 'Print machine-readable JSON.',
} as const
const siteIdArg = {
  type: 'string',
  description: 'Numeric Clicky site ID.',
} as const

const connectCommand = defineCommand({
  meta: {
    name: 'connect',
    description: 'Check and save a Clicky site on this machine',
  },
  args: { 'site-id': siteIdArg, json },
  run: async ({ args }) => {
    const asJson = jsonFlag(args)
    const interactive = canPrompt({ json: asJson })
    if (interactive) intro('Connect Clicky')
    const siteId =
      stringArg(args['site-id']) ??
      (interactive
        ? maybeExitCancelled(
            await text({
              message: 'Clicky site ID',
              validate: (value) =>
                isClickySiteId(value ?? '')
                  ? undefined
                  : 'Enter the numeric site ID from Clicky',
            }),
          )
        : undefined)
    const id = requireClickySiteId(siteId)
    const sitekey =
      process.env[CLICKY_SITEKEY_ENV]?.trim() ||
      (interactive
        ? maybeExitCancelled(
            await password({
              message: 'Clicky sitekey',
              validate: (value) =>
                isClickySitekey(value ?? '')
                  ? undefined
                  : 'Enter the sitekey from Clicky (Preferences, Info)',
            }),
          )
        : undefined)
    if (!sitekey) {
      throw new SeoError(
        'AUTH_REQUIRED',
        `Run this command in a terminal or set ${CLICKY_SITEKEY_ENV}.`,
      )
    }
    const domain = await verify(id, sitekey.trim())
    const source = await writeClickySiteKey(id, sitekey.trim())
    const result = {
      siteId: id,
      domain,
      connected: true,
      credentialSource: source,
    }
    if (asJson) {
      printJson(result)
      return
    }
    const message = `Clicky site ${id}${domain ? ` (${domain})` : ''} saved in the ${credentialSourceLabel(source)}. Next: seo data --source clicky --site ${id}`
    if (interactive) outro(message)
    else process.stdout.write(`${message}\n`)
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show a Clicky site saved on this machine',
  },
  args: {
    'site-id': siteIdArg,
    check: {
      type: 'boolean',
      default: false,
      description: 'Check the saved sitekey with Clicky.',
    },
    json,
  },
  run: async ({ args }) => {
    const siteId = requireClickySiteId(stringArg(args['site-id']))
    const saved = await readClickySiteKey(siteId)
    const check = booleanArg(args.check)
    if (check && saved) await verify(siteId, saved.siteKey)
    const result = {
      siteId,
      connected: Boolean(saved),
      credentialSource: saved?.source,
      liveCheck: check
        ? saved
          ? ('passed' as const)
          : ('unavailable' as const)
        : ('not-requested' as const),
    }
    if (jsonFlag(args)) {
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
    description: 'Moved to seo data --source clicky',
  },
  args: { 'site-id': siteIdArg },
  run: ({ args }) => {
    process.stderr.write(
      `\`seo analytics clicky report\` is now \`seo data --source clicky --site ${stringArg(args['site-id']) ?? '<domain or site ID>'}\`.\n`,
    )
    process.exitCode = 2
  },
})

const disconnectCommand = defineCommand({
  meta: {
    name: 'disconnect',
    description: 'Remove a Clicky site saved on this machine',
  },
  args: { 'site-id': siteIdArg, json },
  run: async ({ args }) => {
    const siteId = requireClickySiteId(stringArg(args['site-id']))
    await deleteClickySiteKey(siteId)
    const environmentCredential = Boolean(process.env[CLICKY_SITEKEY_ENV])
    const result = {
      siteId,
      savedCredentialRemoved: true,
      environmentCredential: environmentCredential ? 'active' : 'missing',
    }
    if (jsonFlag(args)) printJson(result)
    else
      process.stdout.write(
        environmentCredential
          ? `Saved sitekey removed. ${CLICKY_SITEKEY_ENV} is still active.\n`
          : 'Clicky is disconnected for this site.\n',
      )
  },
})

export const clickyAnalyticsCommand = defineCommand({
  meta: {
    name: 'clicky',
    description: 'Save a Clicky site on this machine only',
  },
  subCommands: {
    connect: connectCommand,
    status: statusCommand,
    report: reportCommand,
    disconnect: disconnectCommand,
  },
})
