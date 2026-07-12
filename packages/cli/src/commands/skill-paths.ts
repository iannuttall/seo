import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SeoError } from '@seo/core'

// Skills and evals ship at the package root. Both resolvers honour an explicit
// override, otherwise walk up from the bundled CLI until the directory and its
// README appear. Kept in its own module so the skills command and the eval
// command can share it without importing each other.
export function skillsDirectory(): string {
  return resolvePackagedDirectory('skills', process.env.SEO_SKILLS_DIR)
}

export function evalsDirectory(): string {
  return resolvePackagedDirectory('evals', process.env.SEO_EVALS_DIR)
}

function resolvePackagedDirectory(name: string, override?: string): string {
  if (override) return resolve(override)

  let current = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, name)
    if (existsSync(join(candidate, 'README.md'))) return candidate
    current = dirname(current)
  }

  throw new SeoError(
    'INTERNAL_ERROR',
    `Packaged ${name} could not be found. Reinstall \`seo\` and try again.`,
  )
}

export function readSkillDescription(path: string): string {
  const source = readFileSync(join(path, 'SKILL.md'), 'utf8')
  return source.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''
}
