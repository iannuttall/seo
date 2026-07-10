import { SeoError } from '../errors.js'
import { finalGscDateRange } from '../gsc/dates.js'
import type {
  InternalLinksReport,
  InternalLinksSelection,
  InternalLinksWarning,
} from './internal-links-types.js'

type RuntimeSelectionKey =
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
  checked: number
  candidates: number
}): string {
  if (input.dataStatus === 'target-technical-issue') {
    return 'The target has a technical issue. Resolve it before adding internal links.'
  }
  if (input.dataStatus === 'empty') {
    return 'No retained non-brand GSC queries were found for the target URL aliases in this window.'
  }
  if (input.dataStatus === 'filtered') {
    return 'Target demand exists, but no precision-matched source candidates passed the report filters.'
  }
  if (input.returned) {
    return `${input.returned} internal-link review candidate${input.returned === 1 ? '' : 's'} remained after checking ${input.checked} of ${input.candidates} matched source pages.`
  }
  return `No missing contextual link was confirmed among ${input.checked} checked source page${input.checked === 1 ? '' : 's'}.`
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
