import { SeoError } from '../errors.js'
import { finalGscDateRange } from '../gsc/dates.js'
import type {
  InternalLinksReport,
  InternalLinksSelection,
  InternalLinksWarning,
} from './internal-links-types.js'

type RuntimeSelectionKey =
  | 'attemptedSources'
  | 'checkedSources'
  | 'returnedSources'
  | 'existingLinkExclusions'
  | 'technicalExclusions'
  | 'selfAliasExclusions'
  | 'failedChecks'
  | 'uncheckedCandidates'

export function internalLinksIntegerOption(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  const value = input.value ?? input.fallback
  if (
    !Number.isInteger(value) ||
    value < input.minimum ||
    value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be a whole number between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return value
}

export function internalLinksNumberOption(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  const value = input.value ?? input.fallback
  if (
    !Number.isFinite(value) ||
    value < input.minimum ||
    value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return value
}

export function internalLinksReportRange(days: number, now: Date) {
  return finalGscDateRange(days, now)
}

export function completeInternalLinksSelection(
  analysis: {
    selection: Omit<InternalLinksSelection, RuntimeSelectionKey>
  },
  runtime: Pick<InternalLinksSelection, RuntimeSelectionKey>,
): InternalLinksSelection {
  return { ...analysis.selection, ...runtime }
}

export function internalLinksVerdict(input: {
  dataStatus: InternalLinksReport['dataStatus']
  returned: number
  attempted: number
  checked: number
  candidates: number
  failed: number
  unchecked: number
}): string {
  if (input.dataStatus === 'target-technical-issue') {
    return 'The target has a technical issue. Resolve it before adding internal links.'
  }
  if (input.dataStatus === 'empty') {
    return 'Search Console returned no retained query/page rows for the target URL aliases in this window.'
  }
  if (input.dataStatus === 'source-empty') {
    return 'Search Console returned no retained source query/page rows in this window. This does not prove that no relevant source page exists.'
  }
  if (input.dataStatus === 'filtered') {
    return 'Target demand exists, but no precision-matched source candidates passed the report filters.'
  }
  if (input.returned) {
    return `${input.returned} internal-link review candidate${input.returned === 1 ? '' : 's'} remained after ${input.attempted} verification attempt${input.attempted === 1 ? '' : 's'}; ${input.checked} of ${input.candidates} matched source pages were successfully checked.`
  }
  if (input.dataStatus === 'partial') {
    if (input.candidates === 0 && input.attempted === 0) {
      return 'Internal-link candidates could not be evaluated because required target, provider, or row evidence was incomplete.'
    }
    return `No missing contextual link was confirmed among ${input.checked} successfully checked source page${input.checked === 1 ? '' : 's'}; evidence remains incomplete with ${input.failed} failed check${input.failed === 1 ? '' : 's'} and ${input.unchecked} unattempted candidate${input.unchecked === 1 ? '' : 's'}.`
  }
  return `No missing contextual link was confirmed among ${input.checked} successfully checked source page${input.checked === 1 ? '' : 's'}.`
}

export function uniqueInternalLinksWarnings(
  warnings: InternalLinksWarning[],
): InternalLinksWarning[] {
  return [
    ...new Map(
      warnings.map((warning) => [
        `${warning.stage}\u0000${warning.url}\u0000${warning.code}\u0000${warning.message}`,
        warning,
      ]),
    ).values(),
  ]
}
