import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import { printJson, printTable } from '../utils.js'

type SkillInfo = {
  name: string
  description: string
  path: string
}

function skillsDirectory(): string {
  const override = process.env.SEO_SKILLS_DIR
  if (override) return resolve(override)

  let current = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, 'skills')
    if (existsSync(join(candidate, 'README.md'))) return candidate
    current = dirname(current)
  }

  throw new SeoError(
    'INTERNAL_ERROR',
    'Packaged SEO skills could not be found. Reinstall `seo` and try again.',
  )
}

function skillDescription(path: string): string {
  const source = readFileSync(join(path, 'SKILL.md'), 'utf8')
  return source.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

function listSkills(): SkillInfo[] {
  const root = skillsDirectory()
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')),
    )
    .map((entry) => ({
      name: entry.name,
      description: skillDescription(join(root, entry.name)),
      path: join(root, entry.name),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

function selectedSkill(name?: string): SkillInfo[] {
  const skills = listSkills()
  if (!name) return skills
  const skill = skills.find((entry) => entry.name === name)
  if (!skill) {
    throw new SeoError('INVALID_INPUT', `Unknown skill: ${name}.`)
  }
  return [skill]
}

const listCommand = defineCommand({
  meta: { name: 'list', description: 'List packaged agent skills' },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) => {
    const skills = listSkills()
    if (jsonFlag(args)) {
      printJson({ skills })
      return
    }
    printTable(
      ['Skill', 'Description'],
      skills.map((skill) => [skill.name, skill.description]),
    )
  },
})

const pathCommand = defineCommand({
  meta: { name: 'path', description: 'Print a packaged agent skill path' },
  args: {
    name: {
      type: 'positional',
      description: 'Skill name. Omit it for the skills directory.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) => {
    const name = stringArg(args.name)
    const path = name ? selectedSkill(name)[0]?.path : skillsDirectory()
    if (jsonFlag(args)) {
      printJson({ name, path })
    } else {
      process.stdout.write(`${path}\n`)
    }
  },
})

export const skillsCommand = defineCommand({
  meta: { name: 'skills', description: 'Inspect packaged agent skills' },
  subCommands: {
    list: listCommand,
    path: pathCommand,
  },
})
