import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  createIndexNowKeyRecord,
  listIndexNowKeys,
  removeIndexNowKey,
  resolveIndexNowKey,
  SeoError,
  saveIndexNowKey,
  submitIndexNow,
  verifyIndexNowKey,
} from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, csvArg, jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'

const MAX_URL_FILE_BYTES = 2_100_000

const projectArgs = {
  project: { type: 'string', description: 'Saved project id or name.' },
  client: { type: 'string', description: 'Legacy alias for --project.' },
  site: { type: 'string', description: 'Site URL.' },
} as const

async function selectedSite(args: Record<string, unknown>): Promise<string> {
  const explicit = stringArg(args.site)
  if (explicit) return explicit
  const project = await resolveClient({
    project: projectArg(args),
    options: { json: jsonFlag(args) },
  })
  if (!project) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass --site or select a saved project.',
    )
  }
  return project.siteUrl
}

async function urlsFromArgs(args: Record<string, unknown>): Promise<string[]> {
  const single = stringArg(args.url)
  const inline = csvArg(args.urls) ?? []
  const file = stringArg(args.file)
  if (!single && inline.length === 0 && !file) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass --url, comma-separated --urls, or a newline-delimited --file.',
    )
  }
  const values = [...(single ? [single] : []), ...inline]
  if (file) {
    const info = await stat(file).catch(() => undefined)
    if (!info) {
      throw new SeoError(
        'INVALID_INPUT',
        `IndexNow URL file not found: ${file}`,
      )
    }
    if (!info.isFile() || info.size > MAX_URL_FILE_BYTES) {
      throw new SeoError(
        'INVALID_INPUT',
        'IndexNow URL files must be regular files no larger than 2.1 MB.',
      )
    }
    values.push(
      ...(await readFile(file, 'utf8'))
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    )
  }
  return values
}

const setupCommand = defineCommand({
  meta: {
    name: 'setup',
    description: 'Generate an IndexNow key file for one site',
  },
  args: {
    ...projectArgs,
    output: {
      type: 'string',
      description: 'Public asset directory for the generated key file.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const output = stringArg(args.output)
    if (!output) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass --output with the public asset directory that deploys at the site root.',
      )
    }
    const record = createIndexNowKeyRecord({ site: await selectedSite(args) })
    const directory = resolve(output)
    const path = join(directory, `${record.key}.txt`)
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(path, `${record.key}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new SeoError(
          'INVALID_INPUT',
          `Refusing to overwrite the existing file at ${path}.`,
        )
      }
      throw error
    }
    let credentialSource: Awaited<ReturnType<typeof saveIndexNowKey>>
    try {
      credentialSource = await saveIndexNowKey(record)
    } catch (error) {
      await unlink(path).catch(() => undefined)
      throw error
    }
    const result = {
      configured: true,
      host: record.host,
      keyLocation: record.keyLocation,
      keyFile: path,
      credentialSource,
      nextStep: `Deploy ${path}, then run seo indexnow verify --site ${new URL(record.keyLocation).origin}`,
    }
    if (jsonFlag(args)) printJson(result)
    else
      printKeyValue([
        ['Host', result.host],
        ['Key file', result.keyFile],
        ['Public URL', result.keyLocation],
        ['Saved in', result.credentialSource],
        ['Next', result.nextStep],
      ])
  },
})

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show saved IndexNow hosts' },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const sites = await listIndexNowKeys()
    const result = { configuredSites: sites.length, sites }
    if (jsonFlag(args)) printJson(result)
    else
      printTable(
        ['Host', 'Key location', 'Created'],
        sites.map((site) => [site.host, site.keyLocation, site.createdAt]),
      )
  },
})

const verifyCommand = defineCommand({
  meta: {
    name: 'verify',
    description: 'Check the public IndexNow key file',
  },
  args: {
    ...projectArgs,
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const resolved = await resolveIndexNowKey({
      site: await selectedSite(args),
    })
    const result = {
      ...(await verifyIndexNowKey({ record: resolved.record })),
      credentialSource: resolved.source,
    }
    if (jsonFlag(args)) printJson(result)
    else
      printKeyValue([
        ['Verified', result.verified ? 'yes' : 'no'],
        ['HTTP status', String(result.status)],
        ['Key location', result.keyLocation],
        ['Credential', result.credentialSource],
      ])
    if (!result.verified) process.exitCode = 4
  },
})

const submitCommand = defineCommand({
  meta: {
    name: 'submit',
    description: 'Notify IndexNow about changed URLs',
  },
  args: {
    ...projectArgs,
    url: { type: 'string', description: 'One changed URL.' },
    urls: { type: 'string', description: 'Comma-separated changed URLs.' },
    file: {
      type: 'string',
      description: 'Newline-delimited changed URL file.',
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Validate without notifying IndexNow.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const site = await selectedSite(args)
    const resolved = await resolveIndexNowKey({ site })
    const result = await submitIndexNow({
      record: resolved.record,
      urls: await urlsFromArgs(args),
      dryRun: booleanArg(args['dry-run']),
    })
    const output = { ...result, credentialSource: resolved.source }
    if (jsonFlag(args)) {
      printJson(output)
      return
    }
    printKeyValue([
      ['Host', result.host],
      ['Status', result.status],
      ['URLs', String(result.submittedUrls)],
      ['Dry run', result.dryRun ? 'yes' : 'no'],
      ['Key location', result.keyLocation],
    ])
    for (const caveat of result.caveats) process.stdout.write(`\n${caveat}\n`)
  },
})

const removeCommand = defineCommand({
  meta: { name: 'remove', description: 'Remove a saved IndexNow key' },
  args: {
    ...projectArgs,
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const site = await selectedSite(args)
    const removed = await removeIndexNowKey(site)
    const result = {
      removed,
      note: 'The deployed key file was not removed.',
    }
    if (jsonFlag(args)) printJson(result)
    else
      process.stdout.write(
        `${removed ? 'Saved key removed.' : 'No saved key found.'} ${result.note}\n`,
      )
  },
})

export const indexNowCommand = defineCommand({
  meta: {
    name: 'indexnow',
    description: 'Set up and submit changed URLs with IndexNow',
  },
  subCommands: {
    setup: setupCommand,
    status: statusCommand,
    verify: verifyCommand,
    submit: submitCommand,
    remove: removeCommand,
  },
})
