import { spawnSync } from 'node:child_process'

export type SkillInstallOutcome =
  | { status: 'installed' }
  | { status: 'failed'; error: string }

/**
 * Install the packaged router skill for coding agents through the skills
 * ecosystem. Used by guided setup and by `seo skill install`.
 */
export function installSeoSkill(
  options: { quiet?: boolean } = {},
): SkillInstallOutcome {
  const result = spawnSync('npx', ['-y', 'skills', 'add', 'iannuttall/seo'], {
    stdio: options.quiet ? 'ignore' : 'inherit',
  })
  if (result.error) {
    return { status: 'failed', error: result.error.message }
  }
  if (result.status !== 0) {
    return {
      status: 'failed',
      error: `npx skills add exited with status ${result.status ?? 'unknown'}.`,
    }
  }
  return { status: 'installed' }
}
