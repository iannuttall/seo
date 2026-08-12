import { createHash } from 'node:crypto'
import { explainRule } from '../rules.js'

export type AgentFindingStatus = 'open'

type AgentFindingBase = {
  id: string
  status: AgentFindingStatus
  title: string
  confidence?: 'high' | 'medium' | 'low'
  severity?: string
  affectedCount?: number
  affectedUrls?: {
    total: number
    returned: number
    complete: boolean
    items: string[]
    report?: {
      id: 'affected-urls'
      params: {
        reportId: string
        ruleId: string
      }
    }
  }
  sourcePath: string
  evidence?: Record<string, unknown>
  verification?: { command?: string; expected: string }
}

export type AgentFixFinding = AgentFindingBase & {
  type: 'fix'
  fix: {
    instruction: string
  }
  allowedOutcomes: Array<'fixed' | 'deferred' | 'not-needed'>
}

export type AgentReviewFinding = AgentFindingBase & {
  type: 'review'
  review: {
    question: string
    changeOnlyIf: string
    ifConfirmed: string
    ifNotNeeded: string
    doNot: string[]
  }
  allowedOutcomes: Array<'changed' | 'no-change' | 'deferred'>
}

export type AgentFinding = AgentFixFinding | AgentReviewFinding

export type AgentFindings = {
  schemaVersion: 1
  scope: 'returned-report'
  coverage: {
    state: 'complete' | 'partial' | 'unknown'
    detail: string
  }
  counts: {
    total: number
    returned: number
    fixes: number
    reviews: number
    open: number
  }
  completion: {
    state: 'not-required' | 'pending' | 'complete'
    instruction: string
  }
  verification: {
    requiredAfterChanges: true
    instruction: string
    reportCheck?: string
  }
  sourcePaths: string[]
  items: AgentFinding[]
}

export type AgentReportInventory = {
  id: string
  sourcePath: string
  title: string
  totalItems: number
  returnedItems: number
  complete: boolean
  criteria?: unknown
  note?: string
  pagination?: {
    page: number
    pageCount: number
    nextPage: number | null
  }
  completion: {
    state: 'not-required' | 'pending'
    instruction: string
  }
  items: Array<
    Record<string, unknown> & {
      id: string
      decisionStatus: 'open'
    }
  >
}

export type AgentReportOptions = {
  reportId?: string
  verify?: string
  coverage?: AgentFindings['coverage']['state']
  preferRootActions?: boolean
}

type JsonRecord = Record<string, unknown>
type RankedFinding = AgentFinding & { rank: number }

const ACTION_KEYS = new Set([
  'actions',
  'findings',
  'fixes',
  'issues',
  'nextSteps',
  'priorities',
  'queue',
  'recommendations',
  'reviewObservations',
  'topActions',
  'topFixes',
  'templateRecommendations',
])
const SKIP_KEYS = new Set([
  'inventories',
  'markdown',
  'outputBudget',
  'presentation',
])

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined
}

function isAgentFindings(value: unknown): value is AgentFindings {
  const candidate = record(value)
  const counts = record(candidate?.counts)
  return (
    candidate?.schemaVersion === 1 &&
    candidate.scope === 'returned-report' &&
    typeof counts?.total === 'number' &&
    typeof counts.returned === 'number' &&
    Array.isArray(candidate.items) &&
    candidate.items.every((value) => {
      const item = record(value)
      if (
        !text(item?.id) ||
        item?.status !== 'open' ||
        !text(item.title) ||
        !text(item.sourcePath) ||
        !Array.isArray(item.allowedOutcomes)
      ) {
        return false
      }
      if (item.type === 'fix') {
        return Boolean(text(record(item.fix)?.instruction))
      }
      if (item.type === 'review') {
        const review = record(item.review)
        if (!review) return false
        return Boolean(
          text(review.question) &&
            text(review.changeOnlyIf) &&
            text(review.ifConfirmed) &&
            text(review.ifNotNeeded) &&
            Array.isArray(review.doNot),
        )
      }
      return false
    })
  )
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function compareCodePoints(left: string, right: string): number {
  const a = [...left]
  const b = [...right]
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference =
      (a[index]?.codePointAt(0) ?? 0) - (b[index]?.codePointAt(0) ?? 0)
    if (difference) return difference
  }
  return a.length - b.length
}

function findingId(item: JsonRecord, path: string, action: string): string {
  for (const key of ['ruleId', 'checkId', 'findingId', 'actionId', 'id']) {
    const id = text(item[key])
    if (id) return id
  }
  return `action-${stableId(`${path}|${action}`)}`
}

function findingType(path: string, item: JsonRecord): AgentFinding['type'] {
  return path.endsWith('.reviewObservations') ||
    item.kind === 'review' ||
    item.recommendation === 'review' ||
    item.requiresIntentReview === true
    ? 'review'
    : 'fix'
}

function findingVerification(
  item: JsonRecord,
  fallback?: string,
): AgentFinding['verification'] | undefined {
  const supplied = record(item.verification)
  const expected = text(supplied?.expected ?? item.howToVerify ?? fallback)
  if (!expected) return undefined
  const command = text(supplied?.command)
  return { ...(command ? { command } : {}), expected }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => (text(item) ? [text(item) as string] : []))
}

function affectedUrls(
  item: JsonRecord,
  affectedCount?: number,
): AgentFindingBase['affectedUrls'] | undefined {
  const items = stringArray(item.sampleUrls)
  const details = record(item.affectedUrlsReport)
  const params = record(details?.params)
  const reportId =
    details?.id === 'affected-urls' ? text(params?.reportId) : undefined
  const ruleId =
    details?.id === 'affected-urls' ? text(params?.ruleId) : undefined
  if (!items.length && !reportId) return undefined
  const total = affectedCount ?? items.length
  return {
    total,
    returned: items.length,
    complete: items.length >= total,
    items,
    ...(reportId && ruleId
      ? {
          report: {
            id: 'affected-urls' as const,
            params: { reportId, ruleId },
          },
        }
      : {}),
  }
}

function reviewGuidance(
  item: JsonRecord,
  title: string,
  action: string,
): AgentReviewFinding['review'] {
  const supplied = record(item.review)
  const evidence = record(item.evidence)
  const ruleId = text(item.ruleId ?? evidence?.ruleId)
  const rule = ruleId ? explainRule(ruleId) : undefined
  const defined = rule?.review
  return {
    question:
      text(supplied?.question) ??
      defined?.question ??
      `Does the retained evidence and confirmed intent show that "${title}" needs a change?`,
    changeOnlyIf:
      text(supplied?.changeOnlyIf) ??
      defined?.changeOnlyIf ??
      'Make a change only when the retained evidence and required intent support it.',
    ifConfirmed: text(supplied?.ifConfirmed) ?? action,
    ifNotNeeded:
      text(supplied?.ifNotNeeded) ??
      defined?.ifNotNeeded ??
      'Record no change and cite the evidence or confirmed intent that makes a change unnecessary.',
    doNot: stringArray(supplied?.doNot).length
      ? stringArray(supplied?.doNot)
      : [...(defined?.doNot ?? [])],
  }
}

function findingEvidence(item: JsonRecord): JsonRecord | undefined {
  const evidence = { ...record(item.evidence) }
  for (const key of [
    'target',
    'url',
    'count',
    'sampleUrls',
    'whyThisRanks',
    'score',
    'scoreFactors',
  ]) {
    if (item[key] !== undefined) evidence[key] = item[key]
  }
  return Object.keys(evidence).length ? evidence : undefined
}

function normalizeFinding(
  value: unknown,
  path: string,
  index: number,
  options: AgentReportOptions,
): RankedFinding | undefined {
  if (typeof value === 'string') {
    const action = text(value)
    if (!action) return undefined
    const common = {
      id: `action-${stableId(`${options.reportId ?? ''}|${path}|${action}`)}`,
      status: 'open' as const,
      title: action,
      sourcePath: `${path}[${index}]`,
      ...(options.verify ? { verification: { expected: options.verify } } : {}),
      rank: index,
    }
    return path.endsWith('.reviewObservations')
      ? {
          ...common,
          type: 'review',
          review: reviewGuidance({}, action, action),
          allowedOutcomes: ['changed', 'no-change', 'deferred'],
        }
      : {
          ...common,
          type: 'fix',
          fix: { instruction: action },
          allowedOutcomes: ['fixed', 'deferred', 'not-needed'],
        }
  }

  const item = record(value)
  if (!item) return undefined
  const action =
    text(item.action) ??
    text(item.howToFix) ??
    (item.recommendation === 'fix' || item.recommendation === 'review'
      ? undefined
      : text(item.recommendation)) ??
    text(item.nextStep)
  const title =
    text(item.title) ?? text(item.headline) ?? text(item.name) ?? action
  if (!action || !title) return undefined

  const confidence = ['high', 'medium', 'low'].includes(String(item.confidence))
    ? (item.confidence as AgentFinding['confidence'])
    : undefined
  const rawAffectedCount = item.affectedCount ?? item.count
  const affectedCount =
    typeof rawAffectedCount === 'number' ? rawAffectedCount : undefined
  const verification = findingVerification(item, options.verify)
  const evidence = findingEvidence(item)
  const type = findingType(path, item)
  const urls = affectedUrls(item, affectedCount)
  const common = {
    id: findingId(item, `${options.reportId ?? ''}|${path}`, action),
    status: 'open' as const,
    title,
    ...(confidence ? { confidence } : {}),
    ...(text(item.severity) ? { severity: text(item.severity) } : {}),
    ...(typeof affectedCount === 'number' && Number.isFinite(affectedCount)
      ? { affectedCount }
      : {}),
    ...(urls ? { affectedUrls: urls } : {}),
    sourcePath: `${path}[${index}]`,
    ...(evidence ? { evidence } : {}),
    ...(verification ? { verification } : {}),
    rank: index,
  }
  return type === 'review'
    ? {
        ...common,
        type,
        review: reviewGuidance(item, title, action),
        allowedOutcomes: ['changed', 'no-change', 'deferred'],
      }
    : {
        ...common,
        type,
        fix: { instruction: action },
        allowedOutcomes: ['fixed', 'deferred', 'not-needed'],
      }
}

function mergeFinding(
  first: RankedFinding,
  detailed: RankedFinding,
): RankedFinding {
  return {
    ...detailed,
    ...first,
    type:
      first.type === 'review' || detailed.type === 'review' ? 'review' : 'fix',
    affectedCount: first.affectedCount ?? detailed.affectedCount,
    evidence:
      first.evidence || detailed.evidence
        ? { ...detailed.evidence, ...first.evidence }
        : undefined,
    verification: first.verification ?? detailed.verification,
    ...(first.type === 'review' || detailed.type === 'review'
      ? {
          review:
            first.type === 'review'
              ? first.review
              : (detailed as AgentReviewFinding).review,
          allowedOutcomes: [
            'changed',
            'no-change',
            'deferred',
          ] as AgentReviewFinding['allowedOutcomes'],
        }
      : {
          fix: first.type === 'fix' ? first.fix : detailed.fix,
          allowedOutcomes: [
            'fixed',
            'deferred',
            'not-needed',
          ] as AgentFixFinding['allowedOutcomes'],
        }),
  } as RankedFinding
}

function inventory(
  value: unknown,
  path: string,
  reportId?: string,
): AgentReportInventory | undefined {
  const source = record(value)
  if (!source || !Array.isArray(source.rows)) return undefined
  const totalItems =
    typeof (source.totalPages ?? source.totalItems) === 'number'
      ? Number(source.totalPages ?? source.totalItems)
      : source.rows.length
  const items = source.rows.map((value, index) => {
    const row: JsonRecord = record(value) ?? { value }
    const identity =
      text(row.id) ?? text(row.url) ?? text(row.path) ?? `${path}[${index}]`
    return {
      ...row,
      id: `inventory-item-${stableId(`${reportId ?? ''}|${path}|${identity}`)}`,
      decisionStatus: 'open' as const,
    }
  })
  const pending = items.length > 0
  const page = typeof source.page === 'number' ? source.page : 1
  const pageCount =
    typeof source.pageCount === 'number' ? source.pageCount : undefined
  const nextPage = typeof source.nextPage === 'number' ? source.nextPage : null
  return {
    id: `inventory-${stableId(`${reportId ?? ''}|${path}`)}`,
    sourcePath: path,
    title: 'Content migration inventory',
    totalItems,
    returnedItems: items.length,
    complete: source.capped === false && items.length >= totalItems,
    ...(source.criteria !== undefined ? { criteria: source.criteria } : {}),
    ...(text(source.note) ? { note: text(source.note) } : {}),
    ...(pageCount !== undefined
      ? { pagination: { page, pageCount, nextPage } }
      : {}),
    completion: {
      state: pending ? 'pending' : 'not-required',
      instruction: pending
        ? `Return one decision for every returned row, with evidence; the decision count must equal returnedItems. A recommendation can be explicit while implementation is deferred for owner approval. Do not use one blanket policy or redirect unrelated URLs to a generic hub.${pageCount && pageCount > 1 ? ' Fetch and account for every inventory page before treating it as complete.' : ''}`
        : 'No returned inventory row needs a disposition.',
    },
    items,
  }
}

function collectReportParts(
  report: JsonRecord,
  options: AgentReportOptions,
): {
  findings: AgentFinding[]
  sourcePaths: string[]
  inventories: AgentReportInventory[]
} {
  const findings = new Map<string, RankedFinding>()
  const sourcePaths = new Set<string>()
  const inventories: AgentReportInventory[] = []
  let rank = 0

  function visit(value: unknown, path = '', depth = 0): void {
    const current = record(value)
    if (!current || depth > 6) return
    for (const [key, child] of Object.entries(current).sort(([a], [b]) =>
      compareCodePoints(a, b),
    )) {
      if (!path && key === 'findings' && isAgentFindings(child)) continue
      if (SKIP_KEYS.has(key)) continue
      const childPath = path ? `${path}.${key}` : key
      if (key === 'pageInventory') {
        const found = inventory(child, childPath, options.reportId)
        if (found) inventories.push(found)
      }
      if (
        ACTION_KEYS.has(key) &&
        Array.isArray(child) &&
        (!options.preferRootActions || childPath === 'actions')
      ) {
        sourcePaths.add(childPath)
        child.forEach((item, index) => {
          const found = normalizeFinding(item, childPath, index, options)
          if (!found) return
          found.rank = rank++
          const previous = findings.get(found.id)
          findings.set(
            found.id,
            previous ? mergeFinding(previous, found) : found,
          )
        })
      }
      visit(child, childPath, depth + 1)
    }
  }

  visit(report)
  return {
    findings: [...findings.values()]
      .sort((a, b) => a.rank - b.rank || compareCodePoints(a.id, b.id))
      .map(({ rank: _rank, ...finding }) => finding),
    sourcePaths: [...sourcePaths].sort(compareCodePoints),
    inventories: inventories.sort((a, b) =>
      compareCodePoints(a.sourcePath, b.sourcePath),
    ),
  }
}

function coverage(
  sourcePaths: string[],
  inventories: AgentReportInventory[],
  requested?: AgentFindings['coverage']['state'],
): AgentFindings['coverage'] {
  if (requested === 'partial' || inventories.some((item) => !item.complete)) {
    return {
      state: 'partial',
      detail:
        'At least one source inventory is capped or partial. Do not treat missing rows as zero.',
    }
  }
  if (requested === 'complete') {
    return {
      state: 'complete',
      detail: 'Every finding in the declared report scope is represented.',
    }
  }
  return {
    state: 'unknown',
    detail: sourcePaths.length
      ? 'The findings include every recognised item returned by this report; source acquisition completeness is not declared.'
      : 'This report returned no recognised actionable collection.',
  }
}

export function buildAgentFindings(
  report: JsonRecord,
  options: AgentReportOptions = {},
): {
  findings: AgentFindings
  inventories: AgentReportInventory[]
} {
  const collected = collectReportParts(report, options)
  const fixes = collected.findings.filter((item) => item.type === 'fix').length
  const pending = collected.findings.length > 0
  return {
    findings: {
      schemaVersion: 1,
      scope: 'returned-report',
      coverage: coverage(
        collected.sourcePaths,
        collected.inventories,
        options.coverage,
      ),
      counts: {
        total: collected.findings.length,
        returned: collected.findings.length,
        fixes,
        reviews: collected.findings.length - fixes,
        open: collected.findings.length,
      },
      completion: {
        state: pending ? 'pending' : 'not-required',
        instruction: pending
          ? 'Before finishing, return one allowed outcome and reason for every open item; the outcome count must equal counts.returned. A review is a decision task, not an instruction to change the site. Do not silently drop findings.'
          : 'No returned finding needs completion accounting.',
      },
      verification: {
        requiredAfterChanges: true,
        instruction:
          "After edits, run each changed item's verification and rerun the originating report. A code change alone does not close a finding.",
        ...(options.verify ? { reportCheck: options.verify } : {}),
      },
      sourcePaths: collected.sourcePaths,
      items: collected.findings,
    },
    inventories: collected.inventories,
  }
}

export function withAgentReportContract(
  report: JsonRecord,
  options: AgentReportOptions = {},
): JsonRecord {
  if (isAgentFindings(report.findings)) return report
  const contract = buildAgentFindings(report, options)
  const reportFindings = report.findings
  const clean = Object.fromEntries(
    Object.entries(report).filter(
      ([key]) => key !== 'findings' && key !== 'inventories',
    ),
  )
  return {
    findings: contract.findings,
    ...(reportFindings !== undefined ? { reportFindings } : {}),
    ...(contract.inventories.length
      ? { inventories: contract.inventories }
      : {}),
    ...clean,
  }
}

export function agentActionsView(
  report: JsonRecord,
  options: AgentReportOptions = {},
): JsonRecord {
  const contracted = withAgentReportContract(report, options)
  const output = record(report.output)
  const retainedEvidence = Object.fromEntries(
    Object.entries({
      caveats: report.caveats ?? output?.caveats,
      warnings: report.warnings ?? output?.warnings,
      provenance: report.provenance ?? output?.provenance,
      selection: report.selection ?? output?.selection,
      totals: report.totals ?? output?.totals,
      skippedSections: report.skippedSections ?? output?.skippedSections,
      partialReasons: report.partialReasons ?? output?.partialReasons,
    }).filter(([, value]) => value !== undefined),
  )
  return {
    view: 'actions',
    report: Object.fromEntries(
      Object.entries({
        id: options.reportId,
        workflow: report.workflow,
        site: report.site,
        generatedAt: report.generatedAt,
        summary: report.summary,
        dataStatus: report.dataStatus ?? output?.dataStatus,
      }).filter(([, value]) => value !== undefined),
    ),
    findings: contracted.findings,
    ...(contracted.inventories ? { inventories: contracted.inventories } : {}),
    ...(Object.keys(retainedEvidence).length ? { retainedEvidence } : {}),
  }
}
