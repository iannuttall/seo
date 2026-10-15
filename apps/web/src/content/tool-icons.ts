import {
  Analytics02Icon,
  ChartLineData01Icon,
  CheckListIcon,
  CodeIcon,
  FileEditIcon,
  FileScriptIcon,
  FileValidationIcon,
  Image02Icon,
  Layers01Icon,
  LinkSquare01Icon,
  ListViewIcon,
  Robot01Icon,
  Search01Icon,
  SecurityCheckIcon,
  ServerStack01Icon,
  ShuffleIcon,
  StarIcon,
  TranslateIcon,
} from '@hugeicons/core-free-icons'

// One icon per free tool, keyed by the tool id in tools/manifest.mjs.
export const toolIcons = {
  'llms-txt-generator': FileEditIcon,
  'llms-txt-validator': FileValidationIcon,
  'server-log-analyzer': ServerStack01Icon,
  'sitemap-extractor': ListViewIcon,
  'spam-score-checker': SecurityCheckIcon,
  'domain-rating-checker': StarIcon,
  'website-traffic-checker': ChartLineData01Icon,
  'favicon-checker': Image02Icon,
  'word-combiner': ShuffleIcon,
  'sitemap-validator': Layers01Icon,
  'robots-txt-validator': Robot01Icon,
  'schema-markup-generator': CodeIcon,
  'schema-markup-validator': CheckListIcon,
  'seo-report-template': FileScriptIcon,
  'hreflang-generator': TranslateIcon,
  'serp-preview': Search01Icon,
  'canonical-checker': LinkSquare01Icon,
} as const

export const fallbackToolIcon = Analytics02Icon

export function toolIcon(id: string) {
  return toolIcons[id as keyof typeof toolIcons] ?? fallbackToolIcon
}
