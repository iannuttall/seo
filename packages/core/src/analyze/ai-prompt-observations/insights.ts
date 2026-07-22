import type { StoredAiPromptObservation } from '../../ai-prompt-observations/store.js'
import type {
  AiPromptEvidence,
  AiPromptObservation,
} from '../../providers/contracts.js'
import type { TargetObservation } from './analysis.js'
import type {
  AiPromptObservationsReport,
  CompletedObservation,
  FailedObservation,
  ObservationComparison,
} from './contracts.js'
import type { AiPromptModelInput } from './validation.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function compareObservation(
  current: StoredAiPromptObservation,
  prior: StoredAiPromptObservation | null,
  currentTargets: TargetObservation[],
  previousTargets: TargetObservation[],
  cacheStatus: AiPromptEvidence<AiPromptObservation>['cache']['status'],
): ObservationComparison {
  const base = {
    previousCheckedAt: prior?.checkedAt ?? null,
    previousEffectiveModel: prior?.effectiveModel ?? null,
    answerChanged: null,
    citationDomainsAdded: [] as string[],
    citationDomainsRemoved: [] as string[],
    targetChanges: [] as ObservationComparison['targetChanges'],
  }
  if (cacheStatus === 'hit') {
    return {
      ...base,
      status: 'cached-observation',
      detail:
        'This run reused the same cached provider observation, so it is not a new comparison point.',
    }
  }
  if (!prior) {
    return {
      ...base,
      status: 'no-prior',
      detail: 'No earlier observation has the same fixed configuration.',
    }
  }
  if (current.effectiveModel !== prior.effectiveModel) {
    return {
      ...base,
      status: 'model-changed',
      detail:
        'The provider resolved the requested model to a different effective version, so answer and mention changes are not treated as comparable.',
    }
  }
  if (
    current.completeness !== 'complete' ||
    prior.completeness !== 'complete' ||
    current.answerTruncated ||
    prior.answerTruncated
  ) {
    return {
      ...base,
      status: 'incomplete-evidence',
      detail:
        'At least one observation is partial or truncated, so absence and change claims are withheld.',
    }
  }
  const currentDomains = new Set(current.citations.map((item) => item.domain))
  const priorDomains = new Set(prior.citations.map((item) => item.domain))
  const previousByKey = new Map(previousTargets.map((item) => [item.key, item]))
  const targetChanges = currentTargets.map((item) => {
    const previous = previousByKey.get(item.key)
    const wasObserved = previous?.answerState === 'observed'
    const isObserved = item.answerState === 'observed'
    return {
      key: item.key,
      label: item.label,
      change: isObserved
        ? wasObserved
          ? ('unchanged-observed' as const)
          : ('appeared' as const)
        : wasObserved
          ? ('disappeared' as const)
          : ('unchanged-not-observed' as const),
    }
  })
  return {
    ...base,
    status: 'comparable',
    answerChanged: current.answer !== prior.answer,
    citationDomainsAdded: [...currentDomains]
      .filter((domain) => !priorDomains.has(domain))
      .sort(compareText),
    citationDomainsRemoved: [...priorDomains]
      .filter((domain) => !currentDomains.has(domain))
      .sort(compareText),
    targetChanges,
    detail:
      'Prompt, requested model, effective model, market, web-search setting, token limit, and provider match the earlier observation.',
  }
}

export function aggregateObservationCost(
  observations: Array<CompletedObservation | FailedObservation>,
): AiPromptObservationsReport['cost'] {
  const completed = observations.filter(
    (item): item is CompletedObservation => item.state === 'complete',
  )
  const estimates = completed.map((item) => item.evidence.cost.estimatedMicros)
  const actual = completed.map((item) => item.evidence.cost.actualMicros)
  const exact =
    observations.every((item) => item.state === 'complete') &&
    actual.every((value) => value !== null)
  return {
    currency: 'USD',
    estimatedMicros: estimates.some((value) => value === null)
      ? null
      : estimates.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    actualMicros: exact
      ? actual.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null,
    taskIds: [
      ...new Set(completed.flatMap((item) => item.evidence.cost.taskIds)),
    ].sort(compareText),
    estimateBasis: 'provider-base-fees-only',
    actualCostState: exact ? 'complete' : 'partial-or-unknown',
  }
}

export function citedObservationDomains(
  observations: CompletedObservation[],
): AiPromptObservationsReport['citedDomains'] {
  const grouped = new Map<
    string,
    {
      observations: Set<string>
      surfaces: Set<AiPromptModelInput['surface']>
      targets: Set<string>
    }
  >()
  for (const observation of observations) {
    for (const citation of observation.evidence.data.citations) {
      const current = grouped.get(citation.domain) ?? {
        observations: new Set<string>(),
        surfaces: new Set<AiPromptModelInput['surface']>(),
        targets: new Set<string>(),
      }
      current.observations.add(observation.observationKey)
      current.surfaces.add(observation.surface)
      for (const target of observation.targets) {
        if (target.citedDomains.includes(citation.domain)) {
          current.targets.add(target.key)
        }
      }
      grouped.set(citation.domain, current)
    }
  }
  return [...grouped.entries()]
    .map(([domain, item]) => ({
      domain,
      observationCount: item.observations.size,
      surfaces: [...item.surfaces].sort(compareText),
      targetKeys: [...item.targets].sort(compareText),
    }))
    .sort(
      (left, right) =>
        right.observationCount - left.observationCount ||
        compareText(left.domain, right.domain),
    )
    .slice(0, 50)
}

export function observationFindings(
  observations: CompletedObservation[],
  themes: AiPromptObservationsReport['fanOutThemes'],
): AiPromptObservationsReport['findings'] {
  const findings: AiPromptObservationsReport['findings'] = []
  for (const [index, observation] of observations.entries()) {
    const target = observation.targets.find((item) => item.role === 'target')
    const competitors = observation.targets.filter(
      (item) => item.role === 'competitor',
    )
    const targetChange = observation.comparison.targetChanges.find(
      (item) => item.key === 'target',
    )
    if (targetChange?.change === 'appeared') {
      findings.push({
        code: 'target-appeared',
        evidenceRefs: [`observations[${index}].comparison`],
        detail: `${target?.label ?? 'The target'} appeared in this comparable answer sample after not being observed in the prior sample.`,
        action:
          'Inspect the answer context and cited sources before treating the appearance as a durable change.',
      })
    } else if (targetChange?.change === 'disappeared') {
      findings.push({
        code: 'target-disappeared',
        evidenceRefs: [`observations[${index}].comparison`],
        detail: `${target?.label ?? 'The target'} was not observed in this comparable answer sample after appearing in the prior sample.`,
        action:
          'Repeat the same fixed observation and inspect source changes before deciding whether any content or distribution work is justified.',
      })
    }
    if (
      target?.answerState === 'not-observed' &&
      competitors.some((item) => item.answerState === 'observed')
    ) {
      findings.push({
        code: 'competitor-only-observed',
        evidenceRefs: [`observations[${index}].targets`],
        detail:
          'At least one supplied competitor was observed in this answer while the target was not observed.',
        action:
          'Compare the cited evidence, entity framing, and existing first-party pages before treating this sample as a content gap.',
      })
    }
    if ((target?.citedDomains.length ?? 0) > 0) {
      findings.push({
        code: 'owned-citation-observed',
        evidenceRefs: [`observations[${index}].targets[0].citedDomains`],
        detail: `A supplied target domain was cited in the ${observation.surface} answer sample.`,
        action:
          'Open the cited page and verify the quoted claim, freshness, and surrounding answer context.',
      })
    }
  }
  const targetObserved = observations.filter(
    (item) =>
      item.targets.find((target) => target.role === 'target')?.answerState ===
      'observed',
  ).length
  if (observations.length > 0 && targetObserved === 0) {
    findings.push({
      code: 'target-not-observed',
      evidenceRefs: observations.map(
        (_, index) => `observations[${index}].targets[0]`,
      ),
      detail:
        'The target was not observed in the completed answer samples in this fixed prompt set.',
      action:
        'Do not treat this as universal absence. Review the exact prompts and models, then repeat only the observations that affect a real decision.',
    })
  }
  for (const [index, theme] of themes.slice(0, 3).entries()) {
    findings.push({
      code:
        theme.firstParty.status === 'matched'
          ? 'first-party-fan-out-overlap'
          : 'repeated-fan-out-theme',
      evidenceRefs: [`fanOutThemes[${index}]`],
      detail:
        theme.firstParty.status === 'matched'
          ? `${theme.term} recurred across ${theme.observationCount} observations and overlaps retained Search Console query evidence.`
          : `${theme.term} recurred across ${theme.observationCount} observations, but no retained Search Console match was established.`,
      action:
        theme.firstParty.status === 'matched'
          ? 'Inspect the matched landing pages and cited sources before changing or expanding coverage.'
          : 'Validate intent, independent keyword demand, current results, available source data, and useful page variation before planning new coverage.',
    })
  }
  return findings.slice(0, 20)
}
