import lockfile from 'proper-lockfile'
import { ensureParentDir } from './files.js'

export async function withFileLock<T>(
  path: string,
  task: () => Promise<T>,
): Promise<T> {
  ensureParentDir(path)
  const release = await lockfile.lock(path, {
    stale: 30_000,
    update: 5_000,
    retries: {
      retries: 5,
      factor: 1.3,
      minTimeout: 200,
      maxTimeout: 1_000,
    },
    realpath: false,
  })

  try {
    return await task()
  } finally {
    await release()
  }
}
