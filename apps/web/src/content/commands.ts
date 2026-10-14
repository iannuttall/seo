import {
  Alert02Icon,
  Analytics01Icon,
  Calendar03Icon,
  Database01Icon,
  FileSearchIcon,
  Link01Icon,
  Route01Icon,
  SearchList01Icon,
} from '@hugeicons/core-free-icons'

// The eight commands, in the order people need them. The hosted MCP runs the
// same reports under the tool names listed here.
export const commands = [
  {
    id: 'report',
    command: 'seo report',
    tool: 'seo_report',
    path: '/docs/commands/report',
    icon: Analytics01Icon,
    text: 'The main report. An overview of your Search Console data, then quick wins, low CTR, decaying pages, cannibalization and more.',
  },
  {
    id: 'page',
    command: 'seo page',
    tool: 'seo_page',
    path: '/docs/commands/page',
    icon: FileSearchIcon,
    text: 'One URL. What the live page shows, whether Google has it indexed, and the queries it gets.',
  },
  {
    id: 'compare',
    command: 'seo compare',
    tool: 'seo_compare',
    path: '/docs/commands/compare',
    icon: Calendar03Icon,
    text: 'Before and after a date, such as a release or a Google update, with the updates that fall in the window.',
  },
  {
    id: 'index',
    command: 'seo index',
    tool: 'seo_index',
    path: '/docs/commands/indexing',
    icon: Alert02Icon,
    text: 'Pages that lost their clicks, checked live and with Google URL Inspection.',
  },
  {
    id: 'research',
    command: 'seo research',
    tool: 'seo_research',
    path: '/docs/commands/research',
    icon: SearchList01Icon,
    text: 'Keyword metrics, rankings, SERPs, competitors and backlinks from your own DataForSEO, Ahrefs or Semrush key.',
  },
  {
    id: 'data',
    command: 'seo data',
    tool: 'seo_data',
    path: '/docs/commands/data',
    icon: Database01Icon,
    text: 'Raw Search Console rows for any dimensions. The hosted MCP also reads landing pages from your analytics.',
  },
  {
    id: 'crawl',
    command: 'seo crawl',
    tool: null,
    path: '/docs/commands/crawl',
    icon: Route01Icon,
    text: 'Crawl your site and list technical issues. Runs on your machine with the CLI.',
  },
  {
    id: 'internal-links',
    command: 'seo internal-links',
    tool: null,
    path: '/docs/commands/internal-links',
    icon: Link01Icon,
    text: 'Find pages on your site that could link to a page you choose. Runs on your machine with the CLI.',
  },
] as const
