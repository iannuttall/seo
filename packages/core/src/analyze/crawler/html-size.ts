import { explainRule } from '../../rules.js'
import type {
  CrawlPageSnapshot,
  CrawlRequestObservation,
} from '../monitoring/types.js'
import type { CrawlIssue } from './report.js'

// Googlebot reads the first 2MB of an HTML file for Google Search, measured
// on the uncompressed bytes, and drops the rest. Google writes "2MB"; this
// uses 2,097,152 bytes, the same value the large HTML check has always used.
export const GOOGLEBOT_HTML_LIMIT_BYTES = 2 * 1024 * 1024
// A main content start this far into the limit leaves little of it read.
const NEAR_LIMIT_SHARE = 0.9

export type GooglebotCutEvidence = {
  limitBytes: number
  bytesAfterLimit: number
  /** Byte offset of the first <h1> or <main>, whichever comes first. */
  mainContentStartBytes?: number
  mainContentMarker?: 'h1' | 'main'
  mainContentStart: 'before-limit' | 'near-limit' | 'after-limit' | 'not-found'
  /** Heuristic: words of text outside tags, scripts and styles. */
  visibleWordsBeforeLimit: number
  visibleWordsAfterLimit: number
}

const HIDDEN_BLOCKS =
  /<(script|style|svg|noscript|template)\b[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)/gi

function wordCount(text: string): number {
  return text.match(/[^\s&;]+/g)?.length ?? 0
}

/** Where a page over Googlebot's limit puts its main content. */
export function googlebotCutEvidence(
  html: string,
): GooglebotCutEvidence | undefined {
  const bytes = Buffer.from(html, 'utf8')
  if (bytes.byteLength <= GOOGLEBOT_HTML_LIMIT_BYTES) return undefined
  const marker = /<(h1|main)[\s>/]/i.exec(html)
  // Blank out markup with spaces of the same length, so string positions
  // still match the page and a script split by the limit stays hidden.
  const text = html
    .replace(HIDDEN_BLOCKS, (match) => ' '.repeat(match.length))
    .replace(/<[^>]*>?/g, (match) => ' '.repeat(match.length))
  const limitIndex = bytes
    .subarray(0, GOOGLEBOT_HTML_LIMIT_BYTES)
    .toString('utf8').length
  const startBytes = marker
    ? Buffer.byteLength(html.slice(0, marker.index))
    : undefined
  return {
    limitBytes: GOOGLEBOT_HTML_LIMIT_BYTES,
    bytesAfterLimit: bytes.byteLength - GOOGLEBOT_HTML_LIMIT_BYTES,
    ...(marker && startBytes !== undefined
      ? {
          mainContentStartBytes: startBytes,
          mainContentMarker: marker[1]?.toLowerCase() as 'h1' | 'main',
        }
      : {}),
    mainContentStart:
      startBytes === undefined
        ? 'not-found'
        : startBytes >= GOOGLEBOT_HTML_LIMIT_BYTES
          ? 'after-limit'
          : startBytes >= GOOGLEBOT_HTML_LIMIT_BYTES * NEAR_LIMIT_SHARE
            ? 'near-limit'
            : 'before-limit',
    visibleWordsBeforeLimit: wordCount(text.slice(0, limitIndex)),
    visibleWordsAfterLimit: wordCount(text.slice(limitIndex)),
  }
}

const formatBytes = (value: number): string => value.toLocaleString('en-US')

// Googlebot keeps the first 2MB of HTML. A page whose main content starts
// past it, or whose visible text mostly sits past it, may be indexed
// without that content (the word split is a heuristic).
export function largeHtmlIssue(
  rule: CrawlIssue,
  page: CrawlPageSnapshot,
): CrawlIssue {
  const sizeBytes = page.sizeBytes ?? 0
  const cut = page.googlebotCut
  const htmlSource = page.usedJs ? 'rendered' : 'raw'
  const base: CrawlIssue = {
    ...rule,
    detail: `${Math.round(sizeBytes / 1024)} KB`,
    evidence: {
      sizeBytes,
      thresholdBytes: GOOGLEBOT_HTML_LIMIT_BYTES,
      htmlSource,
    },
  }
  if (!cut) return base
  const words = cut.visibleWordsBeforeLimit + cut.visibleWordsAfterLimit
  const wordsAfterShare = words
    ? Math.round((cut.visibleWordsAfterLimit / words) * 100) / 100
    : undefined
  // Rendered HTML is not the file Googlebot fetches, so it cannot show risk.
  const indexingRisk =
    htmlSource === 'rendered'
      ? 'unknown'
      : cut.mainContentStart === 'after-limit' ||
          cut.mainContentStart === 'near-limit' ||
          (wordsAfterShare ?? 0) > 0.5
        ? 'main-content-past-limit'
        : 'none-found'
  const start =
    cut.mainContentStartBytes === undefined
      ? 'no <h1> or <main> found'
      : `main content (<${cut.mainContentMarker}>) starts at byte ${formatBytes(cut.mainContentStartBytes)}, ${cut.mainContentStart === 'after-limit' ? 'after' : cut.mainContentStart === 'near-limit' ? 'just before' : 'before'} the cut`
  const wordsNote =
    wordsAfterShare === undefined
      ? ''
      : `, with about ${Math.round(wordsAfterShare * 100)}% of the visible words`
  return {
    ...base,
    severity:
      indexingRisk === 'main-content-past-limit' ? 'high' : base.severity,
    detail: `${Math.round(sizeBytes / 1024)} KB; ${start}; ${formatBytes(cut.bytesAfterLimit)} bytes sit past Googlebot's ${formatBytes(cut.limitBytes)}-byte cut${wordsNote}.${indexingRisk === 'main-content-past-limit' ? ' Googlebot stops reading at the cut and indexes only what came before it (the word split is a heuristic).' : ''}`,
    evidence: {
      ...base.evidence,
      googlebotLimitBytes: cut.limitBytes,
      bytesAfterLimit: cut.bytesAfterLimit,
      mainContentStartBytes: cut.mainContentStartBytes ?? null,
      mainContentMarker: cut.mainContentMarker ?? null,
      mainContentStart: cut.mainContentStart,
      visibleWordsBeforeLimit: cut.visibleWordsBeforeLimit,
      visibleWordsAfterLimit: cut.visibleWordsAfterLimit,
      visibleWordsAfterLimitShare: wordsAfterShare ?? null,
      indexingRisk,
    },
  }
}

// Pages over the crawler's own body cap fail before any byte is read into a
// snapshot, so only a lower bound on the size is known.
const RESPONSE_CAP_ERROR =
  /^Page response exceeds the (\d+)-byte response limit/

export function responseCapIssue(
  request: CrawlRequestObservation,
): CrawlIssue | undefined {
  if (request.outcome !== 'failure') return undefined
  const capBytes = Number(RESPONSE_CAP_ERROR.exec(request.error)?.[1])
  if (!capBytes) return undefined
  const rule = explainRule('large_html')
  if (!rule) throw new Error('Missing rule guidance for large_html')
  return {
    ruleId: rule.id,
    title: rule.title,
    category: rule.category,
    severity: rule.defaultSeverity,
    url: request.requestedUrl,
    detail: `Over ${Math.round(capBytes / 1024)} KB; the crawler stopped reading at its ${formatBytes(capBytes)}-byte cap, so where the main content starts is unknown.`,
    evidence: {
      dataStatus: 'partial',
      sizeBytes: null,
      sizeBytesAtLeast: capBytes,
      thresholdBytes: GOOGLEBOT_HTML_LIMIT_BYTES,
      googlebotLimitBytes: GOOGLEBOT_HTML_LIMIT_BYTES,
      bytesAfterLimitAtLeast: capBytes - GOOGLEBOT_HTML_LIMIT_BYTES,
      mainContentStartBytes: null,
      mainContentStart: 'unknown',
      indexingRisk: 'unknown',
    },
  }
}
