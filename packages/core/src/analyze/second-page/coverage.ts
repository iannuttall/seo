import type { extractPage } from '../../extract/page-extractor.js'
import { normalizeText } from '../shared.js'

export function scoreCoverage(
  query: string,
  page: Awaited<ReturnType<typeof extractPage>>,
) {
  const normalizedQuery = normalizeText(query)
  const first100 = page.contentText.split(/\s+/).slice(0, 100).join(' ')
  const h1 = page.headings.find((heading) => heading.level === 1)?.text ?? ''

  return {
    inTitleExact: normalizeText(page.title ?? '').includes(normalizedQuery),
    inMeta: normalizeText(page.metaDescription ?? '').includes(normalizedQuery),
    inH1: normalizeText(h1).includes(normalizedQuery),
    inFirst100Words: normalizeText(first100).includes(normalizedQuery),
    inSlug: normalizeText(new URL(page.finalUrl).pathname).includes(
      normalizedQuery.replace(/\s+/g, '-'),
    ),
    bodyCount:
      normalizeText(page.contentText).split(normalizedQuery).length - 1,
  }
}
