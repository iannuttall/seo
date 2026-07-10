import { toSeoError } from '../../errors.js'
import type { ChangeMeasurement, SeoChange } from '../experiments.js'
import { measureChange } from '../experiments.js'
import type { ChangeMeasurementAttempt } from './types.js'

type MeasureSavedChange = (input: {
  id: string
  refresh?: boolean
}) => Promise<ChangeMeasurement>

export async function measureSavedChanges(
  changes: SeoChange[],
  options: {
    refresh?: boolean
    measure?: MeasureSavedChange
  } = {},
): Promise<ChangeMeasurementAttempt[]> {
  const measure = options.measure ?? measureChange
  return Promise.all(
    changes.map(async (change): Promise<ChangeMeasurementAttempt> => {
      try {
        const measurement = await measure({
          id: change.id,
          refresh: options.refresh,
        })
        return {
          status: 'measured',
          dataStatus: measurement.dataStatus,
          change,
          measurement,
        }
      } catch (error) {
        const normalized = toSeoError(error)
        return {
          status: 'failed',
          dataStatus: 'unavailable',
          change,
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: normalized.retryable,
          },
        }
      }
    }),
  )
}

function partialReason(measurement: ChangeMeasurement): string {
  return (
    measurement.warnings[0] ??
    measurement.caveats.find((caveat) =>
      /incomplete|partial|truncated/i.test(caveat),
    ) ??
    'The requested window or source evidence was incomplete; inspect the structured measurement for provenance.'
  )
}

export function changeMeasurementCaveats(
  attempts: ChangeMeasurementAttempt[],
): string[] {
  return attempts.flatMap((attempt) => {
    if (attempt.status === 'failed') {
      return [
        `Unavailable saved change measurement "${attempt.change.title}": ${attempt.error.message.replace(/[.!?]+$/, '')} (${attempt.error.code}).`,
      ]
    }
    if (attempt.dataStatus === 'partial') {
      return [
        `Partial saved change measurement "${attempt.change.title}": ${partialReason(attempt.measurement).replace(/[.!?]+$/, '')}.`,
      ]
    }
    return []
  })
}

export function narrativeDataStatus(
  diagnosisStatus: 'complete' | 'partial' | 'unavailable',
  attempts: ChangeMeasurementAttempt[],
): 'complete' | 'partial' | 'unavailable' {
  if (
    diagnosisStatus === 'complete' &&
    attempts.some((attempt) => attempt.dataStatus !== 'complete')
  ) {
    return 'partial'
  }
  return diagnosisStatus
}
