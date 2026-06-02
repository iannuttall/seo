import type { extractPage } from '../../extract/page-extractor.js'
import type { Recommendation, SecondPageItem } from '../../types.js'

function estimateExpectedCtr(position: number): number {
  if (position <= 3) {
    return 0.1
  }
  if (position <= 10) {
    return 0.03
  }
  if (position <= 20) {
    return 0.015
  }
  return 0.005
}

export function buildSecondPageRecommendations(
  query: string,
  item: SecondPageItem,
  page: Awaited<ReturnType<typeof extractPage>>,
  relatedQuestions: string[],
): Recommendation[] {
  const recommendations: Recommendation[] = []
  if (!item.coverage.inTitleExact || !item.coverage.inH1) {
    recommendations.push({
      principle: 'C.2',
      evidenceRef: `Query "${query}" is missing from ${!item.coverage.inTitleExact ? 'title' : 'H1'}.`,
      action:
        'Align the page label stack so the primary query appears in the title and H1 naturally.',
      effort: 'S',
      confidence: 'high',
      impactEstimate: `CTR gap to top 10 is ${Math.max(0, estimateExpectedCtr(10) - item.ctr).toFixed(2)}`,
    })
  }

  if (page.wordCount < 800 && relatedQuestions.length > 0) {
    recommendations.push({
      principle: 'C.5',
      evidenceRef: `Page has ${page.wordCount} extracted words and misses related questions: ${relatedQuestions.slice(0, 3).join(', ')}.`,
      action:
        'Add missing subtopic sections that answer the related questions already attached to this query cluster.',
      effort: 'M',
      confidence: 'medium',
      impactEstimate: `If the page moves into the top 10, expected CTR improves from ${item.ctr.toFixed(3)}.`,
    })
  }

  return recommendations
}
