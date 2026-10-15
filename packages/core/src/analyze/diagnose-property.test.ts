import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../errors.js'
import { diagnoseProperty } from './diagnose-property.js'
import { compareSegmentRows } from './segment-impact.js'

const site = 'sc-domain:example.com'

function unavailable(): Promise<never> {
  return Promise.reject(
    new SeoError('INSUFFICIENT_DATA', 'Not enough retained GSC rows.'),
  )
}

test('diagnoseProperty reports unavailable sections without false zero evidence', async () => {
  const progress: string[] = []
  const report = await diagnoseProperty(
    { site, progress: (message) => progress.push(message) },
    {
      trafficAnomaly: unavailable,
      updateCorrelation: unavailable,
      segmentImpact: unavailable,
      decayingReport: unavailable,
      cannibalReport: unavailable,
      strikingDistance: unavailable,
      quickWinsReport: unavailable,
    },
  )

  assert.equal(report.dataStatus, 'unavailable')
  assert.equal(report.skippedSections?.length, 10)
  assert.deepEqual(report.partialReasons, [])
  assert.equal(report.summary.updateAttribution, 'unavailable')
  assert.equal(report.summary.updateAttributionStatus, 'unavailable')
  assert.equal(report.summary.classification, 'insufficient-data')
  assert.equal(
    progress.filter((message) => message === 'Running traffic anomaly').length,
    1,
  )
})

test('non-critical device and country data do not mask an unavailable diagnosis', async () => {
  const report = await diagnoseProperty(
    { site },
    {
      trafficAnomaly: unavailable,
      updateCorrelation: unavailable,
      segmentImpact: (input) =>
        input.dimension === 'device' || input.dimension === 'country'
          ? Promise.resolve(
              compareSegmentRows({
                site,
                dimension: input.dimension,
                before: {
                  startDate: '2026-05-01',
                  endDate: '2026-05-28',
                },
                after: {
                  startDate: '2026-05-29',
                  endDate: '2026-06-25',
                },
                beforeRows: [],
                afterRows: [],
                generatedAt: '2026-07-09T00:00:00.000Z',
              }),
            )
          : unavailable(),
      decayingReport: unavailable,
      cannibalReport: unavailable,
      strikingDistance: unavailable,
      quickWinsReport: unavailable,
    },
  )

  assert.equal(report.dataStatus, 'unavailable')
  assert.equal(report.segments.device.dimension, 'device')
  assert.equal(report.segments.country.dimension, 'country')
})

test('diagnoseProperty keeps authentication and access failures fatal', async () => {
  await assert.rejects(
    diagnoseProperty(
      { site },
      {
        trafficAnomaly: () =>
          Promise.reject(new SeoError('AUTH_REQUIRED', 'Sign in first.')),
        updateCorrelation: unavailable,
        segmentImpact: unavailable,
        decayingReport: unavailable,
        cannibalReport: unavailable,
        strikingDistance: unavailable,
        quickWinsReport: unavailable,
      },
    ),
    (error: unknown) =>
      error instanceof SeoError && error.code === 'AUTH_REQUIRED',
  )
})
