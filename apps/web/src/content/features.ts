import {
  AiChat02Icon,
  Analytics01Icon,
  ChartLineData01Icon,
  McpServerIcon,
  Route01Icon,
  SearchList01Icon,
} from '@hugeicons/core-free-icons'

// The feature pages. Each targets one search phrase and links to the
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
    path: '/features/google-analytics',
    title: 'Google Analytics MCP for SEO',
    text: 'Search sessions beside your clicks, the pages search sends people to, and visits from AI assistants.',
    icon: ChartLineData01Icon,
  },
  {
    path: '/features/ai-search',
    title: 'AI search tracking',
    text: 'The questions people ask AI that show in your Search Console, whether AI answers cite you, visits from AI assistants, and what AI crawlers can read.',
    icon: AiChat02Icon,
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
