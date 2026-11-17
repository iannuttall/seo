import { join } from 'node:path'
import type { ProgressPoint, ProgressStore } from '../commands/progress.js'
import type { ProgressRun } from '../commands/progress-track.js'
import { getSeoCliPaths } from '../paths.js'
import { readJsonFile, writeJsonAtomic } from './files.js'

// Each site's weekly progress points and tracking runs on this machine, in
// progress.json in the config folder (private, like the rest of it).
// `seo reset` removes it with the folder. A missing or unreadable file reads
// as nothing saved.

type Saved = { points: ProgressPoint[]; runs: ProgressRun[] }
type ProgressFile = { version: 1; sites: Record<string, Saved> }

const progressFile = () => join(getSeoCliPaths().configDir, 'progress.json')

function readFile(): ProgressFile {
  const file = readJsonFile<ProgressFile>(progressFile())
  return file?.version === 1 && file.sites ? file : { version: 1, sites: {} }
}

function update(site: string, change: (saved: Saved) => void) {
  const file = readFile()
  const saved = file.sites[site] ?? { points: [], runs: [] }
  change(saved)
  file.sites[site] = saved
  writeJsonAtomic(progressFile(), file, 0o600)
}

// The site's saved progress on this machine, removed from the file.
function takeLocal(site: string): Saved | null {
  const file = readFile()
  const saved = file.sites[site]
  if (!saved) return null
  delete file.sites[site]
  writeJsonAtomic(progressFile(), file, 0o600)
  return saved
}

// Progress for a CLI linked with `seo login`: kept with the account, like
// the hosted server's. A site's points saved on this machine before it was
// linked move to the account the first time it has none for that site, and
// leave this machine.
export function linkedProgress(account: ProgressStore): ProgressStore {
  const moved = new Map<string, Promise<void>>()
  const carry = (site: string) => {
    let done = moved.get(site)
    if (!done) {
      done = (async () => {
        if (!readFile().sites[site]) return
        if ((await account.points(site)).length) return
        const saved = takeLocal(site)
        if (!saved) return
        for (const point of saved.points) await account.addPoint(site, point)
        for (const run of saved.runs) await account.saveRun(site, run)
      })()
      moved.set(site, done)
    }
    return done
  }
  return {
    points: async (site) => {
      await carry(site)
      return account.points(site)
    },
    addPoint: async (site, point) => {
      await carry(site)
      return account.addPoint(site, point)
    },
    runs: async (site) => {
      await carry(site)
      return account.runs(site)
    },
    saveRun: async (site, run) => {
      await carry(site)
      return account.saveRun(site, run)
    },
  }
}

export const localProgress: ProgressStore = {
  points: async (site) => readFile().sites[site]?.points ?? [],
  addPoint: async (site, point) => {
    if (readFile().sites[site]?.points.some((p) => p.week === point.week)) {
      return false
    }
    update(site, (saved) => {
      saved.points = [...saved.points, point].sort((a, b) =>
        a.week.localeCompare(b.week),
      )
    })
    return true
  },
  runs: async (site) => readFile().sites[site]?.runs ?? [],
  saveRun: async (site, run) =>
    update(site, (saved) => {
      saved.runs = [...saved.runs.filter((r) => r.id !== run.id), run].sort(
        (a, b) => a.ran_at.localeCompare(b.ran_at) || a.id.localeCompare(b.id),
      )
    }),
}
