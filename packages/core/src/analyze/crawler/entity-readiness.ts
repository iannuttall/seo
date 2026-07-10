import type { CrawlReport } from './report.js'

export type EntityReadinessCheck = {
  id: string
  status: 'info'
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
  assessment: 'evidence-only'
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

  const evidenceChecks = [
    {
      coverage: pct(entitySchemaPages.length, total),
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
      coverage: siteSameAsEvidence.length ? 100 : 0,
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
      coverage: Math.round(
        (pct(authorPages.length, total) + pct(datePages.length, total)) / 2,
      ),
      check: {
        id: 'authority-freshness',
        title: 'Author and date signals observed',
        plainEnglish: `${pct(authorPages.length, total)}% of evaluated indexable pages expose an author signal and ${pct(datePages.length, total)}% expose a date signal.`,
        action:
          'For editorial content, identify authors and show accurate published or modified dates when that information is useful to readers.',
        evidence: {
          authorCoverage: pct(authorPages.length, total),
          dateCoverage: pct(datePages.length, total),
          authors,
        },
      },
    },
    {
      coverage: pct(titlePages.length, total),
      check: {
        id: 'entity-naming',
        title: 'Title and H1 coverage observed',
        plainEnglish: `${pct(titlePages.length, total)}% of evaluated indexable pages have both a title and H1.`,
        action:
          'Review pages missing either signal. Keep brand, product, and person names accurate wherever they appear.',
      },
    },
  ]

  const checks = evidenceChecks.map(({ coverage, check }) => ({
    ...check,
    status: 'info' as const,
    evidence: { ...check.evidence, observedCoveragePercent: coverage },
  }))
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
    assessment: 'evidence-only',
    headline:
      dataStatus === 'partial'
        ? 'Entity evidence is incomplete; treat these findings as scoped to the evaluated pages, not the whole site.'
        : 'Entity signals are reported as observations, not a ranking, visibility, or machine-understanding score.',
    caveats: [
      ...report.caveats,
      'This report deliberately has no aggregate entity score. Add schema, authors, dates, and sameAs only where they accurately fit the page and a documented use case.',
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
  }
}
