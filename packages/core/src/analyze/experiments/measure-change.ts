import { SeoError } from '../../errors.js'
import { runGa4Report } from '../../ga4/client.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { getChange } from './change-log.js'
import { getContentGroup } from './content-groups.js'
import { ga4LandingPageFilterForChange } from './measurement/analytics.js'
import { classify } from './measurement/classify.js'
import { queryGa4ChangeWindows } from './measurement/ga4-change-provider.js'
import { queryGscChangeWindows } from './measurement/gsc-change-provider.js'
import { fixed } from './measurement/math.js'
import { measurementWindow } from './measurement/window.js'
import type { ChangeMeasurement, ChangeScope, SeoChange } from './types.js'

export type MeasureChangeDependencies = {
  searchAnalytics: typeof querySearchAnalytics
  ga4Report: typeof runGa4Report
  contentGroup: typeof getContentGroup
  now: () => Date
}

const defaultDependencies: MeasureChangeDependencies = {
  searchAnalytics: querySearchAnalytics,
  ga4Report: runGa4Report,
  contentGroup: getContentGroup,
  now: () => new Date(),
}

function resolveContentGroup(
  change: SeoChange,
  contentGroup: typeof getContentGroup,
) {
  if (change.scope !== 'group') return undefined
  const group = contentGroup(change.target)
  if (!group) {
    throw new SeoError(
      'INVALID_INPUT',
      `Content group ${change.target} was not found.`,
    )
  }
  if (group.site !== change.site) {
    throw new SeoError(
      'INVALID_INPUT',
      `Content group ${change.target} belongs to ${group.site}, not ${change.site}.`,
    )
  }
  return group
}

function counterfactualDelta(input: {
  treatmentBefore: number
  treatmentAfter: number
  controlBefore: number
  controlAfter: number
}): number | null {
  if (input.controlBefore <= 0) return null
  const expectedAfter =
    input.treatmentBefore * (input.controlAfter / input.controlBefore)
  return fixed(input.treatmentAfter - expectedAfter)
}

export async function measureChange(
  input: {
    id?: string
    site?: string
    scope?: ChangeScope
    target?: string
    title?: string
    changedAt?: string
    ga4PropertyId?: string
    controlScope?: ChangeScope
    controlTarget?: string
    controlTitle?: string
    beforeDays?: number
    afterDays?: number
    refresh?: boolean
  },
  dependencies: MeasureChangeDependencies = defaultDependencies,
): Promise<ChangeMeasurement> {
  const now = dependencies.now()
  const stored = input.id ? getChange(input.id) : undefined
  const change =
    stored ??
    ({
      id: 'adhoc',
      site: input.site,
      scope: input.scope,
      target: input.target,
      title: input.title ?? 'Ad hoc change measurement',
      changedAt: input.changedAt,
      createdAt: now.toISOString(),
    } as SeoChange)

  if (
    !change.site?.trim() ||
    !change.scope ||
    !change.target?.trim() ||
    !change.changedAt
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass a change id, or provide site, scope, target, and changedAt.',
    )
  }
  if (Boolean(input.controlScope) !== Boolean(input.controlTarget?.trim())) {
    throw new SeoError(
      'INVALID_INPUT',
      'controlScope and controlTarget must be provided together.',
    )
  }

  const window = measurementWindow({
    changedAt: change.changedAt,
    beforeDays: input.beforeDays,
    afterDays: input.afterDays,
    now,
  })
  const { before, after } = window
  const group = resolveContentGroup(change, dependencies.contentGroup)
  const controlChange =
    input.controlScope && input.controlTarget
      ? ({
          id: 'control',
          site: change.site,
          scope: input.controlScope,
          target: input.controlTarget,
          title: input.controlTitle ?? 'Control group',
          changedAt: change.changedAt,
          createdAt: now.toISOString(),
        } satisfies SeoChange)
      : undefined
  const controlGroup = controlChange
    ? resolveContentGroup(controlChange, dependencies.contentGroup)
    : undefined
  const measured = await queryGscChangeWindows({
    change,
    before,
    after,
    group,
    refresh: input.refresh,
    searchAnalytics: dependencies.searchAnalytics,
  })
  const control = controlChange
    ? await queryGscChangeWindows({
        change: controlChange,
        before,
        after,
        group: controlGroup,
        refresh: input.refresh,
        searchAnalytics: dependencies.searchAnalytics,
      })
    : undefined
  const clickPct = measured.delta.clickPct
  const shortWindow = window.effectiveDays < 7
  const unavailableReason = window.afterWindowTruncated
    ? `Only ${window.effectiveDays} of ${window.requestedDays} requested finalized after-days are available.`
    : !measured.comparable
      ? 'A Search Console window has no comparable metrics.'
      : shortWindow
        ? `Only ${window.effectiveDays} finalized day${window.effectiveDays === 1 ? '' : 's'} are available in each window.`
        : undefined
  const classified =
    measured.before.metrics &&
    measured.after.metrics &&
    measured.delta.clicks !== null &&
    measured.delta.position !== null
      ? classify({
          before: measured.before.metrics,
          after: measured.after.metrics,
          clickPct,
          clickDelta: measured.delta.clicks,
          positionDelta: measured.delta.position,
        })
      : {
          verdict: 'not-enough-data' as const,
          confidence: 'low' as const,
          note: 'Comparable Search Console metrics are unavailable.',
        }
  const verdict = unavailableReason
    ? {
        verdict: 'not-enough-data' as const,
        confidence: 'low' as const,
        note: `${unavailableReason} The equal-window metrics are provisional and no directional verdict was assigned.`,
      }
    : measured.status === 'partial' && classified.confidence === 'high'
      ? {
          ...classified,
          confidence: 'medium' as const,
          note: `${classified.note} Confidence is capped because Search Console evidence is partial.`,
        }
      : classified
  const ga4Filter = ga4LandingPageFilterForChange(change, group)
  const queryDimension =
    change.scope === 'query' || group?.dimension === 'query'
  const analytics =
    input.ga4PropertyId && !queryDimension
      ? await queryGa4ChangeWindows({
          propertyId: input.ga4PropertyId,
          before,
          after,
          filter: ga4Filter,
          refresh: input.refresh,
          ga4Report: dependencies.ga4Report,
        })
      : undefined

  const warnings = [
    ...measured.warnings,
    ...(control?.warnings.map((warning) => `Control: ${warning}`) ?? []),
    ...(analytics?.warnings ?? []),
  ]
  const dataStatus =
    window.afterWindowTruncated ||
    measured.status === 'partial' ||
    control?.status === 'partial' ||
    analytics?.warnings.length
      ? 'partial'
      : 'complete'

  return {
    schemaVersion: 1,
    methodology: 'equal-finalized-calendar-windows-v1',
    dataStatus,
    change,
    window: {
      requestedDays: window.requestedDays,
      effectiveDays: window.effectiveDays,
      afterWindowTruncated: window.afterWindowTruncated,
      gscTimezone: 'America/Los_Angeles',
      availableDateWindow: window.availableDateWindow,
    },
    source: {
      searchAnalytics: {
        status: measured.status,
        completeness: measured.completeness,
        dimensions: ['date'],
        searchType: 'web',
        dataState: 'final',
        before: measured.source.before,
        after: measured.source.after,
        ...(control
          ? {
              control: {
                status: control.status,
                completeness: control.completeness,
                before: control.source.before,
                after: control.source.after,
              },
            }
          : {}),
        warnings: [
          ...measured.warnings,
          ...(control?.warnings.map((warning) => `Control: ${warning}`) ?? []),
        ],
      },
      ...(analytics
        ? {
            analytics: {
              status: analytics.warnings.length
                ? ('partial' as const)
                : ('complete' as const),
              before: analytics.source.before,
              after: analytics.source.after,
              warnings: analytics.warnings,
            },
          }
        : {}),
    },
    before: measured.before,
    after: measured.after,
    delta: measured.delta,
    ...(analytics ? { analytics: analytics.report } : {}),
    ...(control && controlChange
      ? {
          control: {
            change: controlChange,
            before: control.before,
            after: control.after,
            delta: control.delta,
            adjusted: {
              methodology: 'control-ratio-counterfactual-v1' as const,
              clickDelta:
                control.comparable &&
                measured.before.metrics &&
                measured.after.metrics &&
                control.before.metrics &&
                control.after.metrics
                  ? counterfactualDelta({
                      treatmentBefore: measured.before.metrics.clicks,
                      treatmentAfter: measured.after.metrics.clicks,
                      controlBefore: control.before.metrics.clicks,
                      controlAfter: control.after.metrics.clicks,
                    })
                  : null,
              clickPctPoints:
                measured.delta.clickPct === null ||
                control.delta.clickPct === null
                  ? null
                  : fixed(measured.delta.clickPct - control.delta.clickPct),
              impressionDelta:
                control.comparable &&
                measured.before.metrics &&
                measured.after.metrics &&
                control.before.metrics &&
                control.after.metrics
                  ? counterfactualDelta({
                      treatmentBefore: measured.before.metrics.impressions,
                      treatmentAfter: measured.after.metrics.impressions,
                      controlBefore: control.before.metrics.impressions,
                      controlAfter: control.after.metrics.impressions,
                    })
                  : null,
              impressionPctPoints:
                measured.delta.impressionPct === null ||
                control.delta.impressionPct === null
                  ? null
                  : fixed(
                      measured.delta.impressionPct -
                        control.delta.impressionPct,
                    ),
            },
            note: 'Adjusted deltas compare the observed treatment result with a control-ratio counterfactual. Controls reduce some shared noise but do not prove causality.',
          },
        }
      : {}),
    ...verdict,
    warnings,
    caveats: [
      `Compared ${window.effectiveDays} finalized Search Console calendar days before and after the change in America/Los_Angeles time.`,
      'Search Console position is impression-weighted average position; before/after timing and controls do not prove causality.',
      ...(window.afterWindowTruncated
        ? [
            `The requested ${window.requestedDays}-day after window is incomplete, so this run is partial and has no directional verdict.`,
          ]
        : []),
      ...(shortWindow
        ? [
            'Fewer than 7 finalized days per window is too short for a directional verdict.',
          ]
        : []),
      ...(measured.completeness === 'retained-query-date-aggregates'
        ? [
            'Query-scoped Search Console data can omit anonymized queries; an absent retained row is not zero traffic.',
          ]
        : []),
      ...(analytics
        ? [
            `GA4 attribution uses landing pages and the GA4 property timezone${analytics.source.before.timeZone ? ` (${analytics.source.before.timeZone})` : ''}; its day boundaries may differ from Search Console Pacific dates.`,
          ]
        : []),
    ],
  }
}
