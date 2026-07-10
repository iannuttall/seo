import type { CrawlReport } from './report.js'

export type EntityReadinessCheck = {
  id: string
  status: 'pass' | 'warning' | 'fail'
  title: string
  plainEnglish: string
  action: string
  evidence?: Record<string, unknown>
  urls?: string[]
}

export type EntityReadinessReport = {
  reportId: string
  url: string
  generatedAt: string
  dataStatus: 'complete' | 'partial'
  evaluatedPages: number
  crawlPages: number
  score: number
  headline: string
  caveats: string[]
  checks: EntityReadinessCheck[]
  entities: {
    schemaTypes: Record<string, number>
    sameAs: string[]
    sameAsByType: Record<string, string[]>
    socialProfiles: string[]
    authors: string[]
  }
  topActions: EntityReadinessCheck[]
}

function status(score: number): EntityReadinessCheck['status'] {
  if (score >= 80) return 'pass'
  if (score >= 45) return 'warning'
  return 'fail'
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

export function entityReadiness(report: CrawlReport): EntityReadinessReport {
  const pages = report.pages.filter(
    (page) => page.indexable && page.status < 400,
  )
  const total = pages.length || 1
  const schemaTypes: Record<string, number> = {}
  for (const page of pages) {
    for (const type of page.schemaTypes ?? []) {
      schemaTypes[type] = (schemaTypes[type] ?? 0) + 1
    }
  }
  const entitySchemaPages = pages.filter((page) =>
    page.schemaTypes?.some((type) =>
      /^(Organization|LocalBusiness|Person|Product|WebSite)$/i.test(type),
    ),
  )
  const sameAsEvidence = pages
    .flatMap((page) => page.schemaSameAsEvidence ?? [])
    .filter((evidence) =>
      evidence.subjectTypes.some((type) =>
        /^(Organization|LocalBusiness|Person)$/i.test(type),
      ),
    )
  const siteSameAsEvidence = sameAsEvidence.filter((evidence) =>
    evidence.subjectTypes.some((type) =>
      /^(Organization|LocalBusiness)$/i.test(type),
    ),
  )
  const sameAs = unique(sameAsEvidence.map((evidence) => evidence.url))
  const sameAsByType: Record<string, string[]> = {}
  for (const evidence of sameAsEvidence) {
    for (const type of evidence.subjectTypes) {
      if (!/^(Organization|LocalBusiness|Person)$/i.test(type)) continue
      sameAsByType[type] = unique([...(sameAsByType[type] ?? []), evidence.url])
    }
  }
  const socialProfiles = unique(
    pages.flatMap((page) => page.socialProfileLinks ?? []),
  )
  const authors = unique(pages.map((page) => page.author))
  const authorPages = pages.filter((page) => page.author || page.geo?.hasAuthor)
  const datePages = pages.filter((page) => page.hasDate || page.geo?.hasDate)
  const titlePages = pages.filter((page) => page.title && page.h1)

  const scoredChecks = [
    {
      score: pct(entitySchemaPages.length, total),
      check: {
        id: 'entity-schema',
        title: 'Entity schema is present',
        plainEnglish: `${pct(entitySchemaPages.length, total)}% of evaluated indexable pages include Organization, LocalBusiness, Person, Product, or WebSite schema.`,
        action:
          'Add accurate entity schema to the homepage and key product, author, organization, and local pages.',
        evidence: { schemaTypes },
        urls: pages
          .filter((page) => !entitySchemaPages.includes(page))
          .slice(0, 10)
          .map((page) => page.finalUrl),
      },
    },
    {
      score: siteSameAsEvidence.length ? 100 : 0,
      check: {
        id: 'same-as',
        title: 'Site entity profiles are connected',
        plainEnglish: siteSameAsEvidence.length
          ? 'The crawl found sameAs links attached to Organization or LocalBusiness structured data.'
          : sameAs.length
            ? 'The crawl found Person sameAs links, but no Organization or LocalBusiness profile evidence for the site entity.'
            : socialProfiles.length
              ? 'The crawl found social-domain links, but they are not enough to prove official profile ownership.'
              : 'The crawl did not find entity-scoped sameAs evidence.',
        action:
          'Connect official profiles with sameAs on Organization, Person, or LocalBusiness schema. Use only profiles you control.',
        evidence: {
          sameAs,
          siteSameAs: unique(
            siteSameAsEvidence.map((evidence) => evidence.url),
          ),
          sameAsEvidence,
          unclassifiedSocialLinks: socialProfiles,
        },
      },
    },
    {
      score: Math.round(
        (pct(authorPages.length, total) + pct(datePages.length, total)) / 2,
      ),
      check: {
        id: 'authority-freshness',
        title: 'Authors and dates are visible',
        plainEnglish:
          'AI systems need signs of who produced content and whether it is fresh.',
        action:
          'Add visible authors, reviewed dates, and updated dates to editorial or advisory content.',
        evidence: {
          authorCoverage: pct(authorPages.length, total),
          dateCoverage: pct(datePages.length, total),
          authors,
        },
      },
    },
    {
      score: pct(titlePages.length, total),
      check: {
        id: 'entity-naming',
        title: 'Page names are clear and consistent',
        plainEnglish: `${pct(titlePages.length, total)}% of evaluated indexable pages have both a title and H1.`,
        action:
          'Use consistent brand, product, and person names in titles, H1s, schema, and profile links.',
      },
    },
  ]

  const checks = scoredChecks.map(({ score, check }) => ({
    ...check,
    status: status(score),
  }))
  const score = Math.round(
    scoredChecks.reduce((sum, item) => sum + item.score, 0) /
      scoredChecks.length,
  )
  const dataStatus =
    report.status === 'completed' && pages.length > 0
      ? ('complete' as const)
      : ('partial' as const)

  return {
    reportId: report.id,
    url: report.config.url,
    generatedAt: report.generatedAt,
    dataStatus,
    evaluatedPages: pages.length,
    crawlPages: report.pages.length,
    score,
    headline:
      dataStatus === 'partial'
        ? 'Entity evidence is incomplete; treat these findings as scoped to the evaluated pages, not the whole site.'
        : score >= 80
          ? 'Entity signals are strong enough for agents to understand the site.'
          : 'Entity signals need tightening so agents can connect the site to the right brand, people, products, and profiles.',
    caveats: [
      ...report.caveats,
      ...(dataStatus === 'partial'
        ? [
            `Entity coverage is based on ${pages.length} evaluated indexable page${pages.length === 1 ? '' : 's'} from a ${report.status} crawl.`,
          ]
        : []),
      ...(socialProfiles.length && !sameAs.length
        ? [
            'Social-domain links are unclassified navigation evidence, not proof that the linked profiles are official.',
          ]
        : []),
    ],
    checks,
    entities: {
      schemaTypes,
      sameAs,
      sameAsByType,
      socialProfiles,
      authors,
    },
    topActions: checks.filter((check) => check.status !== 'pass').slice(0, 5),
  }
}
