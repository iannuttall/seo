export type DocsNavEntry = {
  path: string
  label: string
  description?: string
}

export const docsNav: DocsNavEntry[] = [
  { path: '/docs', label: 'Docs' },
  {
    path: '/docs/getting-started',
    label: 'Getting started',
    description:
      'Install the SEO CLI, connect Search Console, save a local project profile, and run your first useful report.',
  },
  {
    path: '/docs/google',
    label: 'Google data',
    description:
      'Connect read-only Search Console and optional Google Analytics data without treating partial rows as complete evidence.',
  },
  {
    path: '/docs/bing',
    label: 'Bing Webmaster',
    description:
      'Connect one verified Bing site and add bounded Bing search and crawl evidence to a project.',
  },
  {
    path: '/docs/indexnow',
    label: 'IndexNow',
    description:
      'Generate and verify a local key, then notify participating search engines about a bounded list of changed URLs.',
  },
  {
    path: '/docs/cli',
    label: 'CLI',
    description:
      'Run focused SEO reports yourself, produce deterministic JSON, and reuse the same commands in scripts and CI.',
  },
  {
    path: '/docs/typescript',
    label: 'TypeScript package',
    description:
      'Install the seo package in a Node app, call typed core functions, or run the same report catalog used by the CLI and MCP.',
  },
  {
    path: '/docs/crawler',
    label: 'Crawler',
    description:
      'Collect a bounded technical baseline, inspect affected URLs, and compare like-for-like evidence after a release.',
  },
  {
    path: '/docs/reports',
    label: 'SEO reports',
    description:
      'Choose the report that answers your question and learn what its evidence can and cannot establish.',
  },
  {
    path: '/docs/ai-search',
    label: 'AI search evidence',
    description:
      'Check technical eligibility, entity evidence, and known referrals without inventing an AI visibility score.',
  },
  {
    path: '/docs/ai-visibility',
    label: 'AI visibility tracking',
    description:
      'See what AI visibility tracking should measure, what SEO Skill supports now, and what the planned provider-backed report will add.',
  },
  {
    path: '/docs/mcp',
    label: 'Local MCP',
    description:
      'Connect Codex, Claude Code, Claude Desktop, or Cursor to the local report server without hand-editing config.',
  },
  {
    path: '/docs/skill',
    label: 'Agent skill',
    description:
      'Install focused instructions that teach an agent which report to run, how to read it, and what to verify next.',
  },
  {
    path: '/docs/agents',
    label: 'Agent workflows',
    description:
      'Keep report selection narrow and stop missing, capped, or partial data becoming a confident false answer.',
  },
]

export const docsCards = docsNav.filter((entry) => entry.path !== '/docs')

export type DocsCrumb = { label: string; href?: string }

export function docsNavFor(path: string) {
  const index = docsNav.findIndex((entry) => entry.path === path)
  if (index === -1) return null

  const current = docsNav[index]
  const isRoot = current.path === '/docs'
  const breadcrumbs: DocsCrumb[] = [{ label: 'Home', href: '/' }]

  if (isRoot) {
    breadcrumbs.push({ label: 'Docs' })
  } else {
    breadcrumbs.push({ label: 'Docs', href: '/docs' })
    breadcrumbs.push({ label: current.label })
  }

  return {
    current,
    breadcrumbs,
    prev: index > 0 ? docsNav[index - 1] : null,
    next: index < docsNav.length - 1 ? docsNav[index + 1] : null,
  }
}
