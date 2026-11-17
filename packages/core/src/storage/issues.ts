import { join } from 'node:path'
import { cloudIssues } from '../cloud.js'
import type { IssueStore, IssuesFile } from '../commands/issues.js'
import { getSeoCliPaths } from '../paths.js'
import { readJsonFile, writeJsonAtomic } from './files.js'

// Each site's issues list on this machine, in issues.json in the config
// folder (private, like the rest of it). `seo reset` removes it with the
// folder. A missing or unreadable file reads as no issues kept. A machine
// linked to a seoskill.dev account keeps the list with the account instead.

const issuesFile = () => join(getSeoCliPaths().configDir, 'issues.json')

function readFile(): IssuesFile {
  const file = readJsonFile<IssuesFile>(issuesFile())
  return file?.version === 1 && file.sites ? file : { version: 1, sites: {} }
}

export const localIssues: IssueStore = {
  read: async (site) => readFile().sites[site] ?? [],
  write: async (site, issues) => {
    const file = readFile()
    file.sites[site] = issues
    writeJsonAtomic(issuesFile(), file, 0o600)
  },
}

// The linked account's list. The first time the account has none for a site
// that this machine kept a list for, the local list moves to the account and
// leaves this machine, so its marks carry over once.
export const linkedIssues: IssueStore = {
  read: async (site) => {
    const kept = (await cloudIssues.read(site)) ?? []
    if (kept.length) return kept
    const file = readFile()
    const local = file.sites[site]
    if (!local?.length) return kept
    await cloudIssues.write(site, local)
    delete file.sites[site]
    writeJsonAtomic(issuesFile(), file, 0o600)
    return local
  },
  write: cloudIssues.write,
}
