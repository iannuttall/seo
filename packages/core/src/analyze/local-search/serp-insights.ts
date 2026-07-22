import type { SerpResultsReport } from '../serp-results.js'
import type {
  LocalOrganicCompetitor,
  LocalPackListing,
  LocalSerpInsights,
} from './types.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedDomain(value: string): string {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/u, '')
  try {
    return new URL(
      trimmed.includes('://') ? trimmed : `https://${trimmed}`,
    ).hostname.replace(/^www\./u, '')
  } catch {
    return trimmed.replace(/^www\./u, '').replace(/\/+$/u, '')
  }
}

function listingKey(
  listing: SerpResultsReport['evidence']['data']['localPack']['results'][number],
): { type: LocalPackListing['identifier']['type']; value: string } {
  if (listing.cid) return { type: 'google-cid', value: listing.cid }
  if (listing.url) return { type: 'url', value: listing.url }
  return {
    type: 'title-phone',
    value: `${listing.title.normalize('NFKC').trim().toLowerCase()}\u0000${listing.phone ?? ''}`,
  }
}

export function buildLocalSerpInsights(input: {
  site: string
  reports: SerpResultsReport[]
  competitorLimit?: number
  listingLimit?: number
}): LocalSerpInsights {
  const competitorLimit = input.competitorLimit ?? 10
  const listingLimit = input.listingLimit ?? 10
  const targetDomain = normalizedDomain(input.site)
  const competitors = new Map<
    string,
    {
      appearances: number
      bestAbsoluteRank: number
      queries: Set<string>
      urls: Set<string>
      evidenceRefs: string[]
    }
  >()
  const listings = new Map<
    string,
    {
      identifier: LocalPackListing['identifier']
      title: string
      cid: string | null
      domain: string | null
      url: string | null
      phone: string | null
      representativeOrder: string
      appearances: number
      bestAbsoluteRank: number
      queries: Set<string>
      ratingObservations: LocalPackListing['ratingObservations']
      evidenceRefs: string[]
    }
  >()

  const queryObservations = input.reports.map((report, reportIndex) => {
    const query = report.evidence.data.keyword
    const selfRanks = report.evidence.data.organicResults
      .filter((result) => normalizedDomain(result.domain) === targetDomain)
      .map((result) => result.rankAbsolute)
      .sort((left, right) => left - right)
    for (const [
      resultIndex,
      result,
    ] of report.evidence.data.organicResults.entries()) {
      const domain = normalizedDomain(result.domain)
      if (!domain || domain === targetDomain) continue
      const existing = competitors.get(domain) ?? {
        appearances: 0,
        bestAbsoluteRank: result.rankAbsolute,
        queries: new Set<string>(),
        urls: new Set<string>(),
        evidenceRefs: [],
      }
      existing.appearances++
      existing.bestAbsoluteRank = Math.min(
        existing.bestAbsoluteRank,
        result.rankAbsolute,
      )
      existing.queries.add(query)
      existing.urls.add(result.url)
      existing.evidenceRefs.push(
        `serpEvidence.reports[${reportIndex}].evidence.data.organicResults[${resultIndex}]`,
      )
      competitors.set(domain, existing)
    }
    for (const [
      listingIndex,
      listing,
    ] of report.evidence.data.localPack.results.entries()) {
      const identifier = listingKey(listing)
      const key = `${identifier.type}\u0000${identifier.value}`
      const representativeOrder = [
        String(listing.rankAbsolute).padStart(10, '0'),
        report.evidence.data.checkedAt,
        query,
        listing.title,
        listing.url ?? '',
      ].join('\u0000')
      const existing = listings.get(key) ?? {
        identifier,
        title: listing.title,
        cid: listing.cid,
        domain: listing.domain,
        url: listing.url,
        phone: listing.phone,
        representativeOrder,
        appearances: 0,
        bestAbsoluteRank: listing.rankAbsolute,
        queries: new Set<string>(),
        ratingObservations: [],
        evidenceRefs: [],
      }
      existing.appearances++
      if (representativeOrder < existing.representativeOrder) {
        existing.title = listing.title
        existing.cid = listing.cid
        existing.domain = listing.domain
        existing.url = listing.url
        existing.phone = listing.phone
        existing.representativeOrder = representativeOrder
      }
      existing.bestAbsoluteRank = Math.min(
        existing.bestAbsoluteRank,
        listing.rankAbsolute,
      )
      existing.queries.add(query)
      if (listing.rating) {
        existing.ratingObservations.push({
          query,
          checkedAt: report.evidence.data.checkedAt,
          ...listing.rating,
        })
      }
      existing.evidenceRefs.push(
        `serpEvidence.reports[${reportIndex}].evidence.data.localPack.results[${listingIndex}]`,
      )
      listings.set(key, existing)
    }
    return {
      query,
      evidenceRef: `serpEvidence.reports[${reportIndex}]`,
      checkedAt: report.evidence.data.checkedAt,
      effectiveKeyword: report.evidence.data.effectiveKeyword,
      localPackPresent: report.evidence.data.localPack.present,
      localPackListings: report.evidence.data.localPack.results.length,
      organicResults: report.evidence.data.organicResults.length,
      organicCompetitors: new Set(
        report.evidence.data.organicResults
          .map((result) => normalizedDomain(result.domain))
          .filter((domain) => domain && domain !== targetDomain),
      ).size,
      selfBestAbsoluteRank: selfRanks[0] ?? null,
    }
  })

  const allCompetitors: LocalOrganicCompetitor[] = [...competitors.entries()]
    .map(([domain, item]) => ({
      domain,
      relationship: 'search-competitor' as const,
      siteType: 'unknown' as const,
      classificationSource: 'unclassified' as const,
      appearances: item.appearances,
      matchedQueries: item.queries.size,
      queryCoverage: input.reports.length
        ? item.queries.size / input.reports.length
        : 0,
      bestAbsoluteRank: item.bestAbsoluteRank,
      sampleQueries: [...item.queries].sort(compareText).slice(0, 3),
      sampleUrls: [...item.urls].sort(compareText).slice(0, 3),
      evidenceRefs: item.evidenceRefs.slice(0, 5),
    }))
    .sort(
      (left, right) =>
        right.matchedQueries - left.matchedQueries ||
        right.appearances - left.appearances ||
        left.bestAbsoluteRank - right.bestAbsoluteRank ||
        compareText(left.domain, right.domain),
    )

  const allListings: LocalPackListing[] = [...listings.values()]
    .map(({ queries, representativeOrder: _, ...item }) => ({
      ...item,
      matchedQueries: queries.size,
      queryCoverage: input.reports.length
        ? queries.size / input.reports.length
        : 0,
      sampleQueries: [...queries].sort(compareText).slice(0, 3),
      ratingObservations: item.ratingObservations
        .sort(
          (left, right) =>
            compareText(left.checkedAt, right.checkedAt) ||
            compareText(left.query, right.query),
        )
        .slice(0, 3),
      evidenceRefs: item.evidenceRefs.slice(0, 5),
    }))
    .sort(
      (left, right) =>
        right.matchedQueries - left.matchedQueries ||
        right.appearances - left.appearances ||
        left.bestAbsoluteRank - right.bestAbsoluteRank ||
        compareText(left.title, right.title) ||
        compareText(left.identifier.value, right.identifier.value),
    )

  return {
    methodology: 'local-serp-insights-v1',
    queryObservations,
    organicCompetitors: {
      available: allCompetitors.length,
      returned: Math.min(competitorLimit, allCompetitors.length),
      omitted: Math.max(0, allCompetitors.length - competitorLimit),
      limit: competitorLimit,
      items: allCompetitors.slice(0, competitorLimit),
    },
    localPackListings: {
      available: allListings.length,
      returned: Math.min(listingLimit, allListings.length),
      omitted: Math.max(0, allListings.length - listingLimit),
      limit: listingLimit,
      items: allListings.slice(0, listingLimit),
    },
  }
}
