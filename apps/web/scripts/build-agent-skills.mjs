import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillFrontmatter } from '../../../scripts/skill-frontmatter.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '../..')
const sourceRoot = resolve(repoRoot, 'skills')
const outputRoot = resolve(appRoot, 'public/.well-known/agent-skills')
const schema = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

const directories = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const skills = []
for (const directory of directories) {
  const sourcePath = resolve(sourceRoot, directory, 'SKILL.md')
  const source = await readFile(sourcePath)
  const metadata = parseSkillFrontmatter(source.toString('utf8'), sourcePath)
  if (metadata.name !== directory) {
    throw new Error(`${sourcePath}: name must match its folder`)
  }

  const outputPath = resolve(outputRoot, directory, 'SKILL.md')
  await mkdir(dirname(outputPath), { recursive: true })
  await cp(sourcePath, outputPath)
  skills.push({
    name: metadata.name,
    type: 'skill-md',
    description: metadata.description,
    url: `/.well-known/agent-skills/${directory}/SKILL.md`,
    digest: `sha256:${createHash('sha256').update(source).digest('hex')}`,
  })
}

await writeFile(
  resolve(outputRoot, 'index.json'),
  `${JSON.stringify({ $schema: schema, skills }, null, 2)}\n`,
  'utf8',
)

process.stdout.write(`Published ${skills.length} skills for web discovery.\n`)
