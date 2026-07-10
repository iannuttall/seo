import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { select } from '@clack/prompts'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../args.js'
import {
  canPrompt,
  maybeExitCancelled,
  printJson,
  printTable,
} from '../utils.js'

type SkillTarget = 'agents' | 'claude' | 'codex' | 'project'

type SkillInfo = {
  name: string
  description: string
  path: string
}

const targets: Array<{
  value: SkillTarget
  label: string
  hint: string
}> = [
  {
    value: 'agents',
    label: 'Shared agent skills',
    hint: '~/.agents/skills',
  },
  { value: 'codex', label: 'Codex', hint: '~/.codex/skills' },
  { value: 'claude', label: 'Claude Code', hint: '~/.claude/skills' },
  {
    value: 'project',
    label: 'This project',
    hint: './.agents/skills',
  },
]

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

function targetDirectory(target: SkillTarget): string {
  if (target === 'project') return resolve('.agents/skills')
  if (target === 'agents') return join(homedir(), '.agents', 'skills')
  if (target === 'claude') return join(homedir(), '.claude', 'skills')
  return join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'skills')
}

function parseTarget(value?: string): SkillTarget | undefined {
  if (!value) return undefined
  const target = targets.find((entry) => entry.value === value)?.value
  if (!target) {
    throw new SeoError(
      'INVALID_INPUT',
      '--target must be agents, codex, claude, or project.',
    )
  }
  return target
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

const installCommand = defineCommand({
  meta: {
    name: 'install',
    description: 'Copy packaged skills into an agent skills directory',
  },
  args: {
    name: {
      type: 'positional',
      description: 'One skill name. Omit it to install every skill.',
    },
    target: {
      type: 'string',
      description: 'Install target: agents, codex, claude, or project.',
    },
    dir: {
      type: 'string',
      description: 'Custom destination skills directory.',
    },
    force: {
      type: 'boolean',
      default: false,
      description: 'Replace existing skill folders.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const customDirectory = stringArg(args.dir)
    let target = parseTarget(stringArg(args.target))
    if (customDirectory && target) {
      throw new SeoError(
        'INVALID_INPUT',
        'Use either --target or --dir, not both.',
      )
    }
    if (!customDirectory && !target) {
      if (!canPrompt({ json })) {
        throw new SeoError(
          'INVALID_INPUT',
          'Choose a skills destination with --target or --dir.',
        )
      }
      target = maybeExitCancelled(
        await select({
          message: 'Install SEO skills where?',
          options: targets,
        }),
      )
    }

    const destination = customDirectory
      ? resolve(customDirectory)
      : targetDirectory(target ?? 'agents')
    mkdirSync(destination, { recursive: true, mode: 0o700 })
    const force = booleanArg(args.force) ?? false
    const results = selectedSkill(stringArg(args.name)).map((skill) => {
      const path = join(destination, skill.name)
      const exists = existsSync(path)
      if (!exists || force) {
        if (exists) rmSync(path, { recursive: true, force: true })
        cpSync(skill.path, path, { recursive: true, force })
      }
      return { name: skill.name, path, changed: !exists || force }
    })

    if (json) {
      printJson({ destination, results })
      return
    }
    for (const result of results) {
      process.stdout.write(
        `${result.changed ? 'installed' : 'skipped'} ${result.name} · ${result.path}\n`,
      )
    }
  },
})

export const skillsCommand = defineCommand({
  meta: { name: 'skills', description: 'Discover and install agent skills' },
  subCommands: {
    list: listCommand,
    path: pathCommand,
    install: installCommand,
  },
})
