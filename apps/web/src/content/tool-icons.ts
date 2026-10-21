import {
  Analytics02Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  CheckListIcon,
  CodeIcon,
  File01Icon,
  FileEditIcon,
  FileValidationIcon,
  HourglassIcon,
  Image02Icon,
  Layers01Icon,
  LinkSquare01Icon,
  ListViewIcon,
  RankingIcon,
  Robot01Icon,
  Search01Icon,
  SecurityCheckIcon,
  ServerStack01Icon,
  ShuffleIcon,
  StarIcon,
  TranslateIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

// One icon per free tool, keyed by the tool id in tools/manifest.mjs.
export const toolIcons = {
  'google-algorithm-update-checker': Calendar03Icon,
  'competitor-keyword-research': UserGroupIcon,
  'monthly-seo-report': File01Icon,
  'serp-checker': RankingIcon,
  'domain-age-checker': HourglassIcon,
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
  'hreflang-generator': TranslateIcon,
  'serp-preview': Search01Icon,
  'canonical-checker': LinkSquare01Icon,
} as const

export const fallbackToolIcon = Analytics02Icon

export function toolIcon(id: string) {
  return toolIcons[id as keyof typeof toolIcons] ?? fallbackToolIcon
}
