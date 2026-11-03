import {
  AiChat02Icon,
  Analytics01Icon,
  ChartLineData01Icon,
  ComputerTerminal01Icon,
  FileSearchIcon,
  Globe02Icon,
  McpServerIcon,
  Notification01Icon,
  RoboticIcon,
  Route01Icon,
  SearchList01Icon,
  TaskDone01Icon,
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
  {
    path: '/features/seo-crawler',
    title: 'SEO crawler',
    text: 'Crawl any site from your machine, including localhost and staging, for broken links, redirects and tag problems.',
    icon: Globe02Icon,
  },
  {
    path: '/features/google-index-checker',
    title: 'Google index checker',
    text: "Check which of your pages Google has indexed, with Google's own reason for the rest.",
    icon: FileSearchIcon,
  },
  {
    path: '/features/claude-seo',
    title: 'Claude SEO',
    text: 'Add SEO Skill to Claude Code or claude.ai and ask about your own Search Console and keyword data.',
    icon: McpServerIcon,
  },
  {
    path: '/features/chatgpt-seo',
    title: 'ChatGPT SEO',
    text: 'Add SEO Skill to ChatGPT so its SEO answers start from your own clicks, queries and pages.',
    icon: AiChat02Icon,
  },
  {
    path: '/features/seo-agent',
    title: 'AI SEO agent',
    text: 'Let the coding agent you already use read your search data and check its own SEO changes.',
    icon: RoboticIcon,
  },
  {
    path: '/features/seo-reporting',
    title: 'SEO reporting tool',
    text: 'Weekly and client SEO reports your agent writes from Search Console and Google Analytics.',
    icon: TaskDone01Icon,
  },
  {
    path: '/features/seo-monitoring',
    title: 'SEO monitoring',
    text: 'Free index and traffic checks your agent runs, and a weekly site audit in beta with alerts when a page drops out of Google.',
    icon: Notification01Icon,
  },
  {
    path: '/features/seo-for-developers',
    title: 'SEO for developers',
    text: 'Crawl local and staging builds, fail CI on real problems, and give your coding agent your Search Console.',
    icon: ComputerTerminal01Icon,
  },
] as const

export const featurePaths = ['/features', ...features.map((item) => item.path)]
