import { join } from 'node:path'
import type { IssueStore, IssuesFile } from '../commands/issues.js'
import { getSeoCliPaths } from '../paths.js'
import { readJsonFile, writeJsonAtomic } from './files.js'

// Each site's issues list on this machine, in issues.json in the config
// folder (private, like the rest of it). `seo reset` removes it with the
// folder. A missing or unreadable file reads as no issues kept.

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
