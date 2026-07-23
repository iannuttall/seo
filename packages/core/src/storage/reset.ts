import { rmSync } from 'node:fs'
import { getSeoCliPaths } from '../paths.js'
import { deleteTokens } from './config.js'
import { deleteManagedProviderSecrets } from './provider-secrets.js'

export async function resetSeoData(): Promise<void> {
  const cleanup = await Promise.allSettled([
    deleteTokens(),
    deleteManagedProviderSecrets(),
  ])
  const failures = cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length > 0) {
    throw new Error(
      'Reset stopped before deleting local files because saved credentials could not be removed. Unlock the system keychain and run `seo reset --yes` again.',
      { cause: new AggregateError(failures) },
    )
  }

  const paths = getSeoCliPaths()
  rmSync(paths.configDir, { recursive: true, force: true })
  rmSync(paths.cacheDir, { recursive: true, force: true })
  rmSync(paths.logDir, { recursive: true, force: true })
}
