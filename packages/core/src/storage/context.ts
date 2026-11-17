import { join } from 'node:path'
import { cloudContext } from '../cloud.js'
import type { ContextFile, ContextStore } from '../commands/context.js'
import { getSeoCliPaths } from '../paths.js'
import { readJsonFile, writeJsonAtomic } from './files.js'

// Each site's business context on this machine, in context.json in the
// config folder (private, like the rest of it). `seo reset` removes it with
// the folder. A missing or unreadable file reads as no context. A machine
// linked to a seoskill.dev account keeps the context with the account instead.

const contextFile = () => join(getSeoCliPaths().configDir, 'context.json')

function readFile(): ContextFile {
  const file = readJsonFile<ContextFile>(contextFile())
  return file?.version === 1 && file.sites ? file : { version: 1, sites: {} }
}

export const localContext: ContextStore = {
  read: async (site) => readFile().sites[site] ?? null,
  write: async (site, context) => {
    const file = readFile()
    file.sites[site] = context
    writeJsonAtomic(contextFile(), file, 0o600)
  },
}

// The linked account's context. The first time the account has none for a
// site that this machine kept one for, the local context moves to the
// account and leaves this machine.
export const linkedContext: ContextStore = {
  read: async (site) => {
    const kept = await cloudContext.read(site)
    if (kept) return kept
    const file = readFile()
    const local = file.sites[site]
    if (!local) return null
    await cloudContext.write(site, local)
    delete file.sites[site]
    writeJsonAtomic(contextFile(), file, 0o600)
    return local
  },
  write: cloudContext.write,
}
