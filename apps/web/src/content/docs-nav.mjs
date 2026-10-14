// The docs pages in reading order. The docs index, breadcrumbs, previous and
// next links, the sitemap and llms.txt all read this list.

/** @typedef {{ path: string, label: string, description: string }} DocsNavEntry */
/** @typedef {{ title: string, items: DocsNavEntry[] }} DocsNavSection */

/** @type {DocsNavSection[]} */
export const docsSections = [
  {
    title: 'Start',
    items: [
      {
        path: '/docs/getting-started',
        label: 'Getting started',
        description:
          'Connect the hosted MCP or install the CLI, sign in with Google and run your first report.',
      },
      {
        path: '/docs/mcp',
        label: 'Hosted MCP',
        description:
          'Add seoskill.dev/mcp to Claude Code, Codex or any remote MCP client.',
      },
      {
        path: '/docs/keys',
        label: 'API keys',
        description:
          'Add your own DataForSEO, Ahrefs or analytics key. Keys are never stored.',
      },
      {
        path: '/docs/analytics',
        label: 'Analytics',
        description:
          'Google Analytics on the hosted MCP and the CLI, and Clicky or other tools on your machine.',
      },
      {
        path: '/docs/cli',
        label: 'CLI',
        description:
          'Install the open source seo command and run the same reports on your machine.',
      },
    ],
  },
  {
    title: 'Commands',
    items: [
      {
        path: '/docs/report',
        label: 'seo report',
        description:
          'The main Search Console report: an overview first, then one section.',
      },
      {
        path: '/docs/page',
        label: 'seo page',
        description:
          'One URL: live page facts, Google index status and its queries.',
      },
      {
        path: '/docs/compare',
        label: 'seo compare',
        description:
          'Before and after a date, with the Google updates in the window.',
      },
      {
        path: '/docs/indexing',
        label: 'seo index',
        description:
          'Pages that lost their clicks, checked live and with URL Inspection.',
      },
      {
        path: '/docs/research',
        label: 'seo research',
        description:
          'Keyword metrics, rankings, SERPs, competitors and backlinks from your own key.',
      },
      {
        path: '/docs/data',
        label: 'seo data',
        description:
          'Raw Search Console rows, or landing pages from your analytics.',
      },
      {
        path: '/docs/crawl',
        label: 'seo crawl',
        description: 'Crawl your site and list technical issues. CLI only.',
      },
      {
        path: '/docs/internal-links',
        label: 'seo internal-links',
        description:
          'Find pages that could link to a page you choose. CLI only.',
      },
    ],
  },
  {
    title: 'Reference',
    items: [
      {
        path: '/docs/privacy',
        label: 'What is stored',
        description:
          'What the hosted MCP and the CLI keep, and what never leaves your control.',
      },
    ],
  },
]

/** @type {DocsNavEntry[]} */
export const docsPages = docsSections.flatMap((section) => section.items)

export const docsPaths = ['/docs', ...docsPages.map((page) => page.path)]

/** @param {string} path */
export function docsNavFor(path) {
  const index = docsPages.findIndex((entry) => entry.path === path)
  if (index === -1) return null

  const current = docsPages[index]
  /** @type {{ label: string, href?: string }[]} */
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Docs', href: '/docs' },
  ]
  breadcrumbs.push({ label: current.label })

  return {
    current,
    breadcrumbs,
    prev: index > 0 ? docsPages[index - 1] : null,
    next: index < docsPages.length - 1 ? docsPages[index + 1] : null,
  }
}
