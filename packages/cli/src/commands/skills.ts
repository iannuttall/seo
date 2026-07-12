import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import { printJson, printTable } from '../utils.js'
import { readSkillDescription, skillsDirectory } from './skill-paths.js'
import { skillsEvalCommand } from './skills-eval.js'

type SkillInfo = {
  name: string
  description: string
  path: string
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
      description: readSkillDescription(join(root, entry.name)),
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
    eval: skillsEvalCommand,
  },
})
