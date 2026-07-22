import type { DataForSeoUserDataResponse } from './account-schema.js'
import type { DataForSeoAccountSnapshot } from './client-types.js'
import type { DataForSeoUnitPrice } from './paid-request.js'

type UserDataAccount = NonNullable<
  DataForSeoUserDataResponse['tasks'][number]['result']
>[number]

type AccountPrices = Pick<
  DataForSeoAccountSnapshot,
  | 'keywordOverviewPrice'
  | 'keywordDiscoveryPrices'
  | 'domainResearchPrices'
  | 'linkPrices'
  | 'aiMentionPrices'
  | 'serpLiveAdvancedPrice'
  | 'serpTaskPostPrice'
>

function unitPrice(
  components: Array<{ cost_type: string; cost: number }> | null | undefined,
): DataForSeoUnitPrice {
  const prices = components ?? []
  const total = (type: 'per_request' | 'per_result') => {
    const matching = prices.filter((item) => item.cost_type === type)
    return matching.length
      ? matching.reduce(
          (sum, item) => sum + Math.round(item.cost * 1_000_000),
          0,
        )
      : prices.length
        ? 0
        : null
  }
  return {
    perRequestMicros: total('per_request'),
    perResultMicros: total('per_result'),
  }
}

export function dataForSeoAccountPrices(
  account: UserDataAccount,
): AccountPrices {
  return {
    aiMentionPrices: {
      targetMetrics: unitPrice(
        account.price?.ai_optimization?.llm_mentions?.target_metrics?.live
          ?.priority_normal,
      ),
      multiTargetMetrics: unitPrice(
        account.price?.ai_optimization?.llm_mentions?.multi_target_metrics?.live
          ?.priority_normal,
      ),
      searchMentions: unitPrice(
        account.price?.ai_optimization?.llm_mentions?.search_mentions?.live
          ?.priority_normal,
      ),
    },
    keywordOverviewPrice: unitPrice(
      account.price?.dataforseo_labs?.keyword_overview?.live?.priority_normal,
    ),
    keywordDiscoveryPrices: {
      ideas: unitPrice(
        account.price?.dataforseo_labs?.keyword_ideas?.live?.priority_normal,
      ),
      related: unitPrice(
        account.price?.dataforseo_labs?.related_keywords?.live?.priority_normal,
      ),
      suggestions: unitPrice(
        account.price?.dataforseo_labs?.keyword_suggestions?.live
          ?.priority_normal,
      ),
    },
    domainResearchPrices: {
      domainOverview: unitPrice(
        account.price?.dataforseo_labs?.domain_rank_overview?.live
          ?.priority_normal,
      ),
      rankedKeywords: unitPrice(
        account.price?.dataforseo_labs?.ranked_keywords?.live?.priority_normal,
      ),
      rankingPages: unitPrice(
        account.price?.dataforseo_labs?.relevant_pages?.live?.priority_normal,
      ),
      serpCompetitors: unitPrice(
        account.price?.dataforseo_labs?.serp_competitors?.live?.priority_normal,
      ),
    },
    linkPrices: {
      summary: unitPrice(
        account.price?.backlinks?.summary?.live?.priority_normal,
      ),
      backlinks: unitPrice(
        account.price?.backlinks?.backlinks?.live?.priority_normal,
      ),
      referringDomains: unitPrice(
        account.price?.backlinks?.referring_domains?.live?.priority_normal,
      ),
    },
    serpLiveAdvancedPrice: unitPrice(
      account.price?.serp?.live?.advanced?.priority_normal,
    ),
    serpTaskPostPrice: unitPrice(
      account.price?.serp?.task_post?.priority_normal,
    ),
  }
}
