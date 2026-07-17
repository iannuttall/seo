import lockfile from 'proper-lockfile'
import { ensureParentDir } from './files.js'

export async function withFileLock<T>(
  path: string,
  task: () => Promise<T>,
): Promise<T> {
  ensureParentDir(path)
  // Tests set SEO_LOCK_FAST=1 so a wedged lock fails in about a second with a
  // clear error. Real CLI runs keep the patient schedule below, which lets
  // concurrent seo processes wait for each other instead of failing.
  const fastLocks = process.env.SEO_LOCK_FAST === '1'
  const release = await lockfile
    .lock(path, {
      stale: fastLocks ? 2_000 : 60_000,
      update: fastLocks ? 1_000 : 5_000,
      retries: fastLocks
        ? { retries: 5, factor: 1.2, minTimeout: 50, maxTimeout: 200 }
        : { retries: 60, factor: 1.2, minTimeout: 200, maxTimeout: 1_000 },
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
