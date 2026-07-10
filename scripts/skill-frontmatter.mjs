export function parseSkillFrontmatter(source, path = 'SKILL.md') {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error(`${path}: missing YAML frontmatter`)

  const values = {}
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z]+):\s+(.+)$/)
    if (!field) {
      throw new Error(
        `${path}: unsupported frontmatter line ${JSON.stringify(line)}`,
      )
    }
    values[field[1]] = field[2]
  }

  const keys = Object.keys(values).sort()
  if (keys.join(',') !== 'description,name') {
    throw new Error(
      `${path}: frontmatter must contain only name and description`,
    )
  }

  return values
}
