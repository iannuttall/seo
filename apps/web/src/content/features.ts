import {
  Analytics01Icon,
  McpServerIcon,
  Route01Icon,
  SearchList01Icon,
} from '@hugeicons/core-free-icons'

// The four feature pages. Each targets one search phrase and links to the
// docs pages that cover the detail.
export const features = [
  {
    path: '/features/mcp',
    title: 'SEO MCP server',
    text: 'Connect the free hosted MCP or run it locally, and ask your agent about your SEO data.',
    icon: McpServerIcon,
  },
  {
    path: '/features/search-console',
    title: 'Google Search Console MCP',
    text: 'Give your agent your clicks, impressions, CTR, positions, queries and pages.',
    icon: Analytics01Icon,
  },
  {
    path: '/features/keyword-research',
    title: 'SEO keyword research tool',
    text: 'Keyword metrics, SERPs, competitors and backlinks from your own DataForSEO or Ahrefs key.',
    icon: SearchList01Icon,
  },
  {
    path: '/features/seo-audit',
    title: 'SEO audit tool',
    text: 'Crawl the site, check single pages, and find pages that lost their clicks.',
    icon: Route01Icon,
  },
] as const

export const featurePaths = ['/features', ...features.map((item) => item.path)]
