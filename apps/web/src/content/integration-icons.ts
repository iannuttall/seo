import {
  Analytics01Icon,
  BubbleChatIcon,
  ChartLineData01Icon,
  ChatBotIcon,
  CodeIcon,
  ComputerTerminal01Icon,
  Cursor01Icon,
  FastWindIcon,
  GoogleGeminiIcon,
  Link04Icon,
  McpServerIcon,
  Message01Icon,
  MouseLeftClick01Icon,
  Search01Icon,
  SearchList01Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'

// One icon per integration page, keyed by the source or client id in
// integrations.ts. Search Console and Google Analytics match the home page.
const integrationIcons = {
  'google-search-console': Analytics01Icon,
  'google-analytics': ChartLineData01Icon,
  dataforseo: SearchList01Icon,
  ahrefs: Link04Icon,
  clicky: MouseLeftClick01Icon,
  'bing-webmaster-tools': Search01Icon,
  'claude-code': ComputerTerminal01Icon,
  claude: BubbleChatIcon,
  chatgpt: ChatBotIcon,
  codex: CodeIcon,
  cursor: Cursor01Icon,
  'vs-code': SourceCodeIcon,
  'gemini-cli': GoogleGeminiIcon,
  windsurf: FastWindIcon,
  'le-chat': Message01Icon,
} as const

export const integrationIcon = (id: string) =>
  integrationIcons[id as keyof typeof integrationIcons] ?? McpServerIcon
