import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import type { QueryContentCoverage } from '../types.js'
import {
  type PageExtractor,
  type PageFetcher,
  type VerifyQueryContentInput,
  verifyQueryContentWith,
} from './content-coverage-analysis.js'

export * from './content-coverage-analysis.js'

export function verifyQueryContent(
  input: VerifyQueryContentInput & {
    fetch?: PageFetcher
    extract?: PageExtractor
  },
): Promise<QueryContentCoverage> {
  return verifyQueryContentWith({
    ...input,
    fetch: input.fetch ?? fetchPage,
    extract: input.extract ?? extractPage,
  })
}
