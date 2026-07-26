import { SeoError } from '../../errors.js'
import {
  providerIdSchema,
  searchMarketSchema,
} from '../../providers/contracts.js'
import { pseoAuditOptions } from '../pseo/audit.js'
import type {
  PseoMatrixPatternSetInput,
  PseoPairPatternSetInput,
  PseoPatternCoveragePolicy,
  PseoPatternKind,
  PseoPatternSetInput,
  PseoPatternShape,
  PseoPatternsInput,
  PseoPatternValue,
  PseoPatternValueInput,
  PseoTermPatternSetInput,
} from '../pseo-pattern-contract.js'
import { integerOption } from '../site-diagnostics/quick-wins-report-input.js'
import { pseoPatternCatalogEntry } from './catalog.js'

export const PSEO_PATTERN_LIMITS = {
  patternSets: 10,
  valuesPerSet: 100,
  matrixAxes: 3,
  queryTemplates: 5,
  explicitPairs: 250,
  candidates: 250,
  observedPatterns: 40,
  observedQueries: 250,
  keywordMetrics: 50,
  serps: 3,
  serpDepth: 20,
  organicResultsPerSnapshot: 10,
  templates: 25,
  synthesisRows: 2_000,
} as const

type NormalizedPatternSetBase = {
  id: string
  kind: PseoPatternKind
  shape: PseoPatternShape
  coveragePolicy: PseoPatternCoveragePolicy
  queryTemplates: string[]
  pathTemplate?: string
}

export type NormalizedTermPatternSet = NormalizedPatternSetBase & {
  shape: 'terms'
  values: PseoPatternValue[]
}

export type NormalizedPairPatternSet = NormalizedPatternSetBase & {
  shape: 'pairs'
  values: PseoPatternValue[]
  pairing: PseoPairPatternSetInput['pairing']
  anchor?: string
  pairs: Array<{ left: string; right: string }>
}

export type NormalizedMatrixPatternSet = NormalizedPatternSetBase & {
  shape: 'matrix'
  axes: Array<{
    id: string
    values: PseoPatternValue[]
  }>
}

export type NormalizedPseoPatternSet =
  | NormalizedTermPatternSet
  | NormalizedPairPatternSet
  | NormalizedMatrixPatternSet

export type ValidatedPseoPatternsInput = Omit<
  PseoPatternsInput,
  | 'days'
  | 'templateLimit'
  | 'maxSitemapUrls'
  | 'minimumTemplateUrls'
  | 'minimumTemplateShare'
  | 'minimumTemplateImpressions'
  | 'includeBrand'
  | 'patternSets'
  | 'candidateLimit'
  | 'observedQueryLimit'
  | 'includeExternal'
  | 'market'
  | 'provider'
  | 'keywordLimit'
  | 'serpLimit'
  | 'serpDepth'
> & {
  days: number
  templateLimit: number
  maxSitemapUrls: number
  minimumTemplateUrls: number
  minimumTemplateShare: number
  minimumTemplateImpressions: number
  includeBrand: boolean
  patternSets: NormalizedPseoPatternSet[]
  candidateLimit: number
  observedQueryLimit: number
  includeExternal: boolean
  market?: NonNullable<PseoPatternsInput['market']>
  provider?: NonNullable<PseoPatternsInput['provider']>
  keywordLimit: number
  serpLimit: number
  serpDepth: number
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function invalid(message: string): never {
  throw new SeoError('INVALID_INPUT', message)
}

function normalizedId(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (
    !normalized ||
    normalized.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized)
  ) {
    return invalid(
      `${label} must use lowercase letters, numbers, and single hyphens.`,
    )
  }
  return normalized
}

function idFromLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function normalizeValues(
  values: PseoPatternValueInput[],
  label: string,
): PseoPatternValue[] {
  if (values.length < 1 || values.length > PSEO_PATTERN_LIMITS.valuesPerSet) {
    return invalid(
      `${label} must contain 1 to ${PSEO_PATTERN_LIMITS.valuesPerSet} values.`,
    )
  }
  const normalized = values.map((value, index): PseoPatternValue => {
    const rawLabel = typeof value === 'string' ? value : value.label
    const itemLabel = rawLabel.trim().replace(/\s+/gu, ' ')
    if (!itemLabel || itemLabel.length > 80) {
      return invalid(
        `${label}[${index}] needs a label of 80 characters or fewer.`,
      )
    }
    const rawId = typeof value === 'string' ? idFromLabel(itemLabel) : value.id
    if (!rawId) {
      return invalid(
        `${label}[${index}] needs an explicit ASCII id because its label cannot form one.`,
      )
    }
    return {
      id: normalizedId(rawId, `${label}[${index}].id`),
      label: itemLabel,
    }
  })
  const ids = new Set<string>()
  for (const value of normalized) {
    if (ids.has(value.id)) {
      return invalid(`${label} contains the duplicate id ${value.id}.`)
    }
    ids.add(value.id)
  }
  return normalized.sort((left, right) => compareCodepoints(left.id, right.id))
}

function placeholders(value: string): string[] {
  return [
    ...new Set(
      [...value.matchAll(/\{([a-z][a-z0-9-]{0,39})\}/gu)].map(
        (match) => match[1] as string,
      ),
    ),
  ].sort(compareCodepoints)
}

function normalizeTemplate(input: {
  value: string
  label: string
  required: string[]
  isPath?: boolean
}): string {
  const value = input.value.trim().replace(/\s+/gu, ' ')
  if (!value || value.length > (input.isPath ? 200 : 120)) {
    return invalid(
      `${input.label} must contain 1 to ${input.isPath ? 200 : 120} characters.`,
    )
  }
  if (input.isPath && (!value.startsWith('/') || /[?#\s]/u.test(value))) {
    return invalid(
      `${input.label} must be an absolute path without a query or hash.`,
    )
  }
  if (/[{}]/u.test(value.replace(/\{[a-z][a-z0-9-]{0,39}\}/gu, ''))) {
    return invalid(`${input.label} contains a malformed placeholder.`)
  }
  const found = placeholders(value)
  const unknown = found.filter((name) => !input.required.includes(name))
  const missing = input.required.filter((name) => !found.includes(name))
  if (unknown.length || missing.length) {
    return invalid(
      `${input.label} must use exactly these placeholders: ${input.required.map((name) => `{${name}}`).join(', ')}.`,
    )
  }
  return value
}

function normalizeTemplates(input: {
  set: PseoPatternSetInput
  required: string[]
}): Pick<NormalizedPatternSetBase, 'queryTemplates' | 'pathTemplate'> {
  if (
    input.set.queryTemplates.length < 1 ||
    input.set.queryTemplates.length > PSEO_PATTERN_LIMITS.queryTemplates
  ) {
    return invalid(
      `${input.set.id}.queryTemplates must contain 1 to ${PSEO_PATTERN_LIMITS.queryTemplates} templates.`,
    )
  }
  const queryTemplates = [
    ...new Set(
      input.set.queryTemplates.map((value, index) =>
        normalizeTemplate({
          value,
          label: `${input.set.id}.queryTemplates[${index}]`,
          required: input.required,
        }),
      ),
    ),
  ].sort(compareCodepoints)
  const pathTemplate = input.set.pathTemplate
    ? normalizeTemplate({
        value: input.set.pathTemplate,
        label: `${input.set.id}.pathTemplate`,
        required: input.required,
        isPath: true,
      })
    : undefined
  return { queryTemplates, pathTemplate }
}

function normalizeBase(
  input: PseoPatternSetInput,
): Omit<NormalizedPatternSetBase, 'queryTemplates' | 'pathTemplate'> {
  const id = normalizedId(input.id, 'pattern set id')
  let catalog: ReturnType<typeof pseoPatternCatalogEntry>
  try {
    catalog = pseoPatternCatalogEntry(input.kind)
  } catch {
    return invalid(`${id}.kind is not a supported pSEO pattern kind.`)
  }
  if (
    input.coveragePolicy !== undefined &&
    !['evidence-led', 'complete-set'].includes(input.coveragePolicy)
  ) {
    return invalid(`${id}.coveragePolicy must be evidence-led or complete-set.`)
  }
  if (!catalog.shapes.includes(input.shape)) {
    return invalid(
      `${id} cannot use ${input.shape}; ${input.kind} supports ${catalog.shapes.join(', ')}.`,
    )
  }
  return {
    id,
    kind: input.kind,
    shape: input.shape,
    coveragePolicy: input.coveragePolicy ?? 'evidence-led',
  }
}

function normalizeTermSet(
  input: PseoTermPatternSetInput,
): NormalizedTermPatternSet {
  return {
    ...normalizeBase(input),
    ...normalizeTemplates({ set: input, required: ['value'] }),
    shape: 'terms',
    values: normalizeValues(input.values, `${input.id}.values`),
  }
}

function normalizePairSet(
  input: PseoPairPatternSetInput,
): NormalizedPairPatternSet {
  if (!['anchor', 'all-pairs', 'explicit'].includes(input.pairing)) {
    return invalid(
      `${input.id}.pairing must be anchor, all-pairs, or explicit.`,
    )
  }
  const values = normalizeValues(input.values, `${input.id}.values`)
  if (values.length < 2) {
    return invalid(`${input.id}.values needs at least two values for pairs.`)
  }
  const valueIds = new Set(values.map((value) => value.id))
  const anchor =
    input.pairing === 'anchor'
      ? normalizedId(input.anchor ?? '', `${input.id}.anchor`)
      : undefined
  if (anchor && !valueIds.has(anchor)) {
    return invalid(`${input.id}.anchor must reference one of its values.`)
  }
  if (input.pairing !== 'anchor' && input.anchor !== undefined) {
    return invalid(`${input.id}.anchor is only valid for anchor pairing.`)
  }
  if (input.pairing !== 'explicit' && input.pairs !== undefined) {
    return invalid(`${input.id}.pairs is only valid for explicit pairing.`)
  }
  const pairs =
    input.pairing === 'explicit'
      ? (input.pairs ?? []).map((pair, index) => {
          const left = normalizedId(
            pair.left,
            `${input.id}.pairs[${index}].left`,
          )
          const right = normalizedId(
            pair.right,
            `${input.id}.pairs[${index}].right`,
          )
          if (left === right) {
            return invalid(
              `${input.id}.pairs[${index}] cannot pair a value with itself.`,
            )
          }
          if (!valueIds.has(left) || !valueIds.has(right)) {
            return invalid(
              `${input.id}.pairs[${index}] must reference ids from its values.`,
            )
          }
          return { left, right }
        })
      : []
  if (
    input.pairing === 'explicit' &&
    (pairs.length < 1 || pairs.length > PSEO_PATTERN_LIMITS.explicitPairs)
  ) {
    return invalid(
      `${input.id}.pairs must contain 1 to ${PSEO_PATTERN_LIMITS.explicitPairs} pairs.`,
    )
  }
  const uniquePairs = new Map(
    pairs.map((pair) => [`${pair.left}\u0000${pair.right}`, pair]),
  )
  return {
    ...normalizeBase(input),
    ...normalizeTemplates({ set: input, required: ['left', 'right'] }),
    shape: 'pairs',
    values,
    pairing: input.pairing,
    anchor,
    pairs: [...uniquePairs.values()].sort(
      (left, right) =>
        compareCodepoints(left.left, right.left) ||
        compareCodepoints(left.right, right.right),
    ),
  }
}

function normalizeMatrixSet(
  input: PseoMatrixPatternSetInput,
): NormalizedMatrixPatternSet {
  if (
    input.axes.length < 1 ||
    input.axes.length > PSEO_PATTERN_LIMITS.matrixAxes
  ) {
    return invalid(
      `${input.id}.axes must contain 1 to ${PSEO_PATTERN_LIMITS.matrixAxes} axes.`,
    )
  }
  const axes = input.axes
    .map((axis) => ({
      id: normalizedId(axis.id, `${input.id}.axis id`),
      values: normalizeValues(axis.values, `${input.id}.${axis.id}`),
    }))
    .sort((left, right) => compareCodepoints(left.id, right.id))
  if (new Set(axes.map((axis) => axis.id)).size !== axes.length) {
    return invalid(`${input.id}.axes contains duplicate ids.`)
  }
  return {
    ...normalizeBase(input),
    ...normalizeTemplates({
      set: input,
      required: axes.map((axis) => axis.id),
    }),
    shape: 'matrix',
    axes,
  }
}

function normalizePatternSets(
  patternSets: PseoPatternSetInput[] | undefined,
): NormalizedPseoPatternSet[] {
  if ((patternSets?.length ?? 0) > PSEO_PATTERN_LIMITS.patternSets) {
    return invalid(
      `patternSets must contain at most ${PSEO_PATTERN_LIMITS.patternSets} sets.`,
    )
  }
  const normalized = (patternSets ?? []).map((set) => {
    if (set.shape === 'terms') return normalizeTermSet(set)
    if (set.shape === 'pairs') return normalizePairSet(set)
    if (set.shape === 'matrix') return normalizeMatrixSet(set)
    return invalid('Each pattern set needs a supported shape.')
  })
  const ids = new Set<string>()
  for (const set of normalized) {
    if (ids.has(set.id)) {
      return invalid(`patternSets contains the duplicate id ${set.id}.`)
    }
    ids.add(set.id)
  }
  return normalized.sort((left, right) => compareCodepoints(left.id, right.id))
}

export function validatePseoPatternsInput(
  input: PseoPatternsInput,
): ValidatedPseoPatternsInput {
  const site = input.site.trim()
  if (!site || site.length > 2_048) {
    return invalid('pSEO patterns requires a Search Console site.')
  }
  const audit = pseoAuditOptions({
    days: input.days,
    sitemaps: input.sitemaps,
    maxSitemapUrls: input.maxSitemapUrls,
    templateLimit: input.templateLimit ?? PSEO_PATTERN_LIMITS.templates,
    minimumTemplateUrls: input.minimumTemplateUrls,
    minimumTemplateShare: input.minimumTemplateShare,
    minimumTemplateImpressions: input.minimumTemplateImpressions,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand ?? true,
  })
  const candidateLimit = integerOption({
    value: input.candidateLimit,
    fallback: 100,
    minimum: 1,
    maximum: PSEO_PATTERN_LIMITS.candidates,
    label: 'candidateLimit',
  })
  const observedQueryLimit = integerOption({
    value: input.observedQueryLimit,
    fallback: 100,
    minimum: 1,
    maximum: PSEO_PATTERN_LIMITS.observedQueries,
    label: 'observedQueryLimit',
  })
  const includeExternal = input.includeExternal ?? false
  const keywordLimit = integerOption({
    value: input.keywordLimit,
    fallback: includeExternal ? 25 : 0,
    minimum: 0,
    maximum: PSEO_PATTERN_LIMITS.keywordMetrics,
    label: 'keywordLimit',
  })
  const serpLimit = integerOption({
    value: input.serpLimit,
    fallback: 0,
    minimum: 0,
    maximum: PSEO_PATTERN_LIMITS.serps,
    label: 'serpLimit',
  })
  const serpDepth = integerOption({
    value: input.serpDepth,
    fallback: 10,
    minimum: 1,
    maximum: PSEO_PATTERN_LIMITS.serpDepth,
    label: 'serpDepth',
  })
  const marketResult = input.market
    ? searchMarketSchema.safeParse(input.market)
    : undefined
  if (marketResult && !marketResult.success) {
    return invalid('Use a valid external search market.')
  }
  const providerResult = input.provider
    ? providerIdSchema.safeParse(input.provider)
    : undefined
  if (providerResult && !providerResult.success) {
    return invalid('Use a supported external provider.')
  }
  if (includeExternal && !marketResult?.success) {
    return invalid(
      'External pSEO pattern research requires a country and language market.',
    )
  }
  if (
    !includeExternal &&
    (input.market !== undefined ||
      input.provider !== undefined ||
      (input.keywordLimit ?? 0) > 0 ||
      serpLimit > 0)
  ) {
    return invalid(
      'Set includeExternal before passing market, provider, keyword, or SERP options.',
    )
  }
  const projectId = input.projectId?.trim()
  if (input.projectId !== undefined && (!projectId || projectId.length > 80)) {
    return invalid('projectId must contain 1 to 80 characters.')
  }

  return {
    ...input,
    site,
    days: audit.days,
    templateLimit: audit.templateLimit,
    maxSitemapUrls: audit.maxSitemapUrls,
    minimumTemplateUrls: audit.minimumTemplateUrls,
    minimumTemplateShare: audit.minimumTemplateShare,
    minimumTemplateImpressions: audit.minimumTemplateImpressions,
    includeBrand: audit.includeBrand ?? true,
    patternSets: normalizePatternSets(input.patternSets),
    candidateLimit,
    observedQueryLimit,
    includeExternal,
    market: marketResult?.success ? marketResult.data : undefined,
    provider: providerResult?.success ? providerResult.data : undefined,
    projectId,
    keywordLimit,
    serpLimit,
    serpDepth,
  }
}
