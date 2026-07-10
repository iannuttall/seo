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
  assert.equal(report.summary.updateAttribution, 'unavailable')
  assert.equal(report.summary.updateAttributionStatus, 'unavailable')
  assert.equal(report.summary.classification, 'not-enough-evidence')
  assert.match(
    report.updateCorrelation.actions.join('\n'),
    /Restore traffic anomaly evidence/,
  )
  assert.doesNotMatch(
    report.updateCorrelation.actions.join('\n'),
    /Search Status provider/,
  )
  assert.equal(
    progress.filter((message) => message === 'Running traffic anomaly').length,
    1,
  )
})

test('diagnoseProperty distinguishes an unavailable update provider from weak attribution', async () => {
  const report = await diagnoseProperty(
    { site },
    {
      trafficAnomaly: () =>
        Promise.resolve({
          site,
          generatedAt: '2026-07-09T00:00:00.000Z',
          anomalies: [],
          rows: 90,
        }),
      updateCorrelation: () =>
        Promise.reject(
          new SeoError(
            'OPTIONAL_PROVIDER_UNAVAILABLE',
            'Search Status was unavailable.',
          ),
        ),
      segmentImpact: unavailable,
      decayingReport: unavailable,
      cannibalReport: unavailable,
      strikingDistance: unavailable,
      quickWinsReport: unavailable,
    },
  )

  assert.equal(report.summary.updateAttribution, 'unavailable')
  assert.equal(report.summary.updateAttributionStatus, 'unavailable')
  assert.equal(report.summary.classification, 'not-enough-evidence')
  assert.match(report.updateCorrelation.summary, /unavailable for this run/)
  assert.match(
    report.updateCorrelation.evidence.join('\n'),
    /Search Status was unavailable/,
  )
  assert.doesNotMatch(
    report.updateCorrelation.evidence.join('\n'),
    /no daily rows/,
  )
  assert.match(
    report.updateCorrelation.actions.join('\n'),
    /Retry update attribution when the Search Status provider is available/,
  )
  assert.doesNotMatch(
    report.updateCorrelation.actions.join('\n'),
    /enough daily GSC data/,
  )
  assert.equal(
    report.skippedSections?.find(
      (section) => section.section === 'update correlation',
    )?.reason,
    'Search Status was unavailable.',
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

test('long diagnosis windows skip impossible adjacent segment comparisons', async () => {
  let segmentCalls = 0
  const report = await diagnoseProperty(
    { site, days: 365 },
    {
      trafficAnomaly: unavailable,
      updateCorrelation: unavailable,
      segmentImpact: async () => {
        segmentCalls += 1
        return unavailable()
      },
      decayingReport: unavailable,
      cannibalReport: unavailable,
      strikingDistance: unavailable,
      quickWinsReport: unavailable,
    },
  )

  assert.equal(segmentCalls, 0)
  const segmentSkips =
    report.skippedSections?.filter((section) =>
      section.section.endsWith('movement segments'),
    ) ?? []
  assert.equal(segmentSkips.length, 4)
  assert.match(segmentSkips[0]?.reason ?? '', /240 days or fewer/)
  assert.equal(report.segments.page.dataStatus, 'unavailable')
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
