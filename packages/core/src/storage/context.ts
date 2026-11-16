import { join } from 'node:path'
import type { ContextFile, ContextStore } from '../commands/context.js'
import { getSeoCliPaths } from '../paths.js'
import { readJsonFile, writeJsonAtomic } from './files.js'

// Each site's business context on this machine, in context.json in the
// config folder (private, like the rest of it). `seo reset` removes it with
// the folder. A missing or unreadable file reads as no context.

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
