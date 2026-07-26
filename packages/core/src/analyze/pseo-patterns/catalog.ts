import type {
  PseoPatternCatalogEntry,
  PseoPatternKind,
} from '../pseo-pattern-contract.js'

export const PSEO_PATTERN_CATALOG: readonly PseoPatternCatalogEntry[] = [
  {
    kind: 'alternatives',
    label: 'Alternatives',
    description:
      'Compare one named option with a useful set of substitutes for a clear use case.',
    shapes: ['terms'],
    automaticDetection: 'direct',
    queryExamples: ['feedly alternatives', 'pocket alternative'],
    requirements: [
      'A defensible option set and stated inclusion criteria.',
      'Current facts about when each option fits.',
    ],
  },
  {
    kind: 'comparison',
    label: 'Comparisons',
    description:
      'Group head-to-head searches into one page topic for each useful pair.',
    shapes: ['pairs'],
    automaticDetection: 'direct',
    queryExamples: ['feedly vs inoreader', 'keep compared with pocket'],
    requirements: [
      'Current facts for both entities and an honest use-case comparison.',
      'One canonical topic for reversed query wording unless result intent differs.',
    ],
  },
  {
    kind: 'conversion',
    label: 'Conversions',
    description:
      'Serve searches that convert a value, unit, format, or state into another.',
    shapes: ['pairs', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['pdf to word converter', 'usd to gbp'],
    requirements: [
      'A working conversion with documented inputs, outputs, and units.',
      'A current source for any value that changes over time.',
    ],
  },
  {
    kind: 'count-statistic',
    label: 'Counts and statistics',
    description:
      'Answer repeated entity questions with dated counts or calculated statistics.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['how many people have this surname', 'number of examples'],
    requirements: [
      'A named source, observation date, unit, and calculation method.',
      'Clear handling for missing, filtered, sampled, and estimated values.',
    ],
  },
  {
    kind: 'curation',
    label: 'Curated lists',
    description:
      'Group searches for the best or most useful options in a defined category.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'heuristic',
    queryExamples: ['best rss readers', 'top research tools'],
    requirements: [
      'Named evaluation criteria and enough first-hand review to support the order.',
      'A visible update policy for facts that can change.',
    ],
  },
  {
    kind: 'directory',
    label: 'Directories',
    description:
      'Expose a bounded inventory through useful categories, filters, and records.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'declared-only',
    queryExamples: ['rss reader directory', 'research tools by category'],
    requirements: [
      'Stable identifiers, useful fields, coverage rules, and duplicate prevention.',
      'Filters or categories that help users make a real decision.',
    ],
  },
  {
    kind: 'docs-how-to',
    label: 'Documentation and how-to',
    description:
      'Answer repeated setup, API, workflow, and troubleshooting searches.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['feed api documentation', 'how to export bookmarks'],
    requirements: [
      'Working instructions matched to the current product or process.',
      'Version, prerequisite, and failure-state details where they matter.',
    ],
  },
  {
    kind: 'examples',
    label: 'Examples',
    description:
      'Collect real examples for a repeated type, category, or use case.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['newsletter examples', 'research workflow examples'],
    requirements: [
      'Real examples with permission or a valid public source.',
      'Useful classification and an explanation of what each example shows.',
    ],
  },
  {
    kind: 'glossary',
    label: 'Glossary',
    description:
      'Explain repeated terms with definitions, context, and related concepts.',
    shapes: ['terms'],
    automaticDetection: 'direct',
    queryExamples: ['what is an rss feed', 'read it later definition'],
    requirements: [
      'Accurate definitions supported by primary or authoritative references.',
      'Examples and related terms that add more than a dictionary definition.',
    ],
  },
  {
    kind: 'integration',
    label: 'Integrations',
    description:
      'Cover working connections between a product and another service.',
    shapes: ['pairs', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['keep notion integration', 'feedly slack sync'],
    requirements: [
      'A real integration, supported workflow, or clearly stated limitation.',
      'Current setup steps and the fields or actions the connection supports.',
    ],
  },
  {
    kind: 'list-facet',
    label: 'Lists and facets',
    description:
      'Expose useful slices of a larger inventory through repeated attributes.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['last names starting with a', 'tools by category'],
    requirements: [
      'A bounded inventory with stable facet rules.',
      'Enough records or context for each retained slice to help a user.',
    ],
  },
  {
    kind: 'location',
    label: 'Locations',
    description:
      'Match a service, record set, or useful local fact with a named place.',
    shapes: ['matrix'],
    automaticDetection: 'declared-only',
    queryExamples: ['coworking spaces in bristol', 'accountants in leeds'],
    requirements: [
      'Actual local records and place-specific fields.',
      'A defensible location hierarchy and duplicate-location rules.',
    ],
  },
  {
    kind: 'meaning-origin',
    label: 'Meaning and origin',
    description:
      'Answer repeated meaning, origin, or history questions for named entities.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['nuttall surname origin', 'amelia name meaning'],
    requirements: [
      'Entity-specific facts from named sources.',
      'Clear uncertainty where sources disagree or evidence is incomplete.',
    ],
  },
  {
    kind: 'no-login',
    label: 'No-login utilities',
    description:
      'Match a useful action with searches that explicitly avoid an account or sign-in.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: [
      'save thread without login',
      'read article without account',
    ],
    requirements: [
      'A working public action that genuinely needs no account.',
      'Clear limits and privacy behavior.',
    ],
  },
  {
    kind: 'persona',
    label: 'Audiences and use cases',
    description:
      'Match a product or solution with a role, industry, or concrete use case.',
    shapes: ['matrix'],
    automaticDetection: 'declared-only',
    queryExamples: ['rss reader for researchers', 'crm for estate agents'],
    requirements: [
      'Specific workflows and product facts for the named audience.',
      'Evidence or examples that distinguish the page from a swapped heading.',
    ],
  },
  {
    kind: 'pricing',
    label: 'Pricing',
    description: 'Cover repeated price, cost, fee, and plan questions.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['feedly pricing', 'rss reader cost'],
    requirements: [
      'Current prices, units, billing periods, limits, and observation dates.',
      'A stable update process for prices that can change.',
    ],
  },
  {
    kind: 'profile',
    label: 'Entity profiles',
    description:
      'Publish useful records for people, products, companies, or other named entities.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'declared-only',
    queryExamples: ['person profile', 'software company facts'],
    requirements: [
      'Stable identifiers, sourced fields, and entity-resolution rules.',
      'Enough unique information for each profile to stand on its own.',
    ],
  },
  {
    kind: 'rarity-popularity',
    label: 'Rarity and popularity',
    description:
      'Answer repeated questions about how common, rare, or popular a named entity is.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['surname rarity', 'most popular first names'],
    requirements: [
      'A named dataset, observation date, population, and calculation method.',
      'Clear handling for ranks, ties, missing records, and small samples.',
    ],
  },
  {
    kind: 'reviews-community',
    label: 'Reviews and community',
    description:
      'Group searches asking for reviews, opinions, complaints, or community experience.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['feedly reviews', 'pocket reddit'],
    requirements: [
      'Traceable review or community evidence with dates and source context.',
      'A clear distinction between observed opinions and product facts.',
    ],
  },
  {
    kind: 'template',
    label: 'Templates',
    description:
      'Provide a usable template for a repeated document, asset, or workflow.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['research brief template', 'newsletter template'],
    requirements: [
      'A usable asset rather than a preview or repeated explanation.',
      'Format, compatibility, and licence details where relevant.',
    ],
  },
  {
    kind: 'utility',
    label: 'Search utilities',
    description:
      'Serve repeated calculator, generator, checker, lookup, grader, or tester searches.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['reading time calculator', 'rss feed checker'],
    requirements: [
      'A working input and useful output with clear failure states.',
      'Documented accuracy, limits, and data handling.',
    ],
  },
  {
    kind: 'workflow-action',
    label: 'Workflow actions',
    description:
      'Match repeated export, download, save, import, or other task wording.',
    shapes: ['terms', 'matrix'],
    automaticDetection: 'direct',
    queryExamples: ['export feedly bookmarks', 'download saved articles'],
    requirements: [
      'A working action or current instructions for completing it.',
      'Supported formats, limits, and failure states.',
    ],
  },
  {
    kind: 'custom',
    label: 'Custom pattern',
    description:
      'Research a bounded query shape that does not fit a built-in family.',
    shapes: ['terms', 'pairs', 'matrix'],
    automaticDetection: 'declared-only',
    queryExamples: ['{value} benchmark', '{product} for {workflow}'],
    requirements: [
      'A clear query template and a bounded set of variables.',
      'A data or utility plan that makes every retained topic useful.',
    ],
  },
] as const

const catalogByKind = new Map(
  PSEO_PATTERN_CATALOG.map((entry) => [entry.kind, entry]),
)

export function pseoPatternCatalogEntry(
  kind: PseoPatternKind,
): PseoPatternCatalogEntry {
  const entry = catalogByKind.get(kind)
  if (!entry) throw new Error(`Missing pSEO pattern catalog entry: ${kind}`)
  return entry
}
