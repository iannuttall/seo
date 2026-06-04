import lockfile from 'proper-lockfile'
import { ensureParentDir } from './files.js'

export async function withFileLock<T>(
  path: string,
  task: () => Promise<T>,
): Promise<T> {
  ensureParentDir(path)
  const release = await lockfile
    .lock(path, {
      stale: 60_000,
      update: 5_000,
      retries: {
        retries: 60,
        factor: 1.2,
        minTimeout: 200,
        maxTimeout: 1_000,
      },
      realpath: false,
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Could not acquire local file lock for ${path}. Another seo process may still be writing auth/config state. Wait a few seconds and retry. ${message}`,
      )
    })

  try {
    return await task()
  } finally {
    await release()
  }
}
