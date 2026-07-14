import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import {
  printCallout,
  printHeading,
  printJson,
  printKeyValue,
} from '../utils.js'
import { installSeoSkill } from './skill-install.js'
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
  meta: { name: 'list', description: 'Show the packaged SEO skill' },
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
    printHeading('SEO skill', 'Packaged with this CLI.')
    process.stdout.write('\n')
    for (const skill of skills) {
      printKeyValue([
        ['Name', skill.name],
        [
          'Purpose',
          'Helps agents choose and run the right SEO audit or report.',
        ],
        ['Path', skill.path],
      ])
    }
    process.stdout.write('\n')
    printCallout({
      title: 'Add it to an agent',
      body: 'Run setup to install the skill and connect your first site.',
      command: 'seo start',
    })
  },
})

const pathCommand = defineCommand({
  meta: { name: 'path', description: 'Print a packaged agent skill path' },
  args: {
    name: {
      type: 'positional',
      description: 'Skill name. Omit it for the skill directory.',
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
    description: 'Install the SEO skill for coding agents',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) => {
    const json = jsonFlag(args)
    const result = installSeoSkill({ quiet: json })
    if (json) {
      printJson(result)
      if (result.status === 'failed') process.exitCode = 1
      return
    }
    if (result.status === 'failed') {
      throw new SeoError(
        'INTERNAL_ERROR',
        `Skill install failed: ${result.error}`,
      )
    }
    process.stdout.write(
      'SEO skill installed. Agents that support skills can discover it now.\n',
    )
  },
})

export const skillsCommand = defineCommand({
  meta: {
    name: 'skill',
    description: 'Inspect the packaged SEO skill and run its evals',
  },
  subCommands: {
    list: listCommand,
    path: pathCommand,
    install: installCommand,
    eval: skillsEvalCommand,
  },
})
