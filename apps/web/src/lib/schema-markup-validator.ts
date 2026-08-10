export const SCHEMA_MARKUP_LIMITS = Object.freeze({
  characters: 500_000,
  blocks: 50,
  entities: 500,
  issues: 200,
})

type JsonObject = Record<string, unknown>

export type SchemaValidationIssue = {
  severity: 'error' | 'warning' | 'advice'
  code: string
  message: string
  block?: number
  path?: string
  line?: number
}

export type SchemaValidationReport = {
  schema: 1
  profile: {
    name: 'common-search-schema-types'
    reviewedAt: '2026-08-10'
    supportedTypes: string[]
  }
  valid: boolean
  dataStatus: 'complete' | 'partial'
  input: {
    characters: number
    blocks: number
    format: 'json' | 'html' | 'unknown'
  }
  summary: {
    entities: number
    recognizedEntities: number
    errors: number
    warnings: number
    advice: number
  }
  entityTypes: Array<{ type: string; count: number }>
  issues: SchemaValidationIssue[]
  limits: typeof SCHEMA_MARKUP_LIMITS
}

const PROFILE_RULES: Record<
  string,
  { required: string[]; recommended: string[]; advice?: string }
> = {
  AggregateRating: {
    required: ['itemReviewed.@type', 'itemReviewed.name', 'ratingValue'],
    recommended: ['bestRating', 'worstRating'],
    advice:
      'The rating and counts must be visible on the page. Google review stars are unavailable for self-controlled LocalBusiness or Organization reviews.',
  },
  Article: {
    required: ['headline', 'image', 'datePublished', 'author.name'],
    recommended: ['dateModified', 'author.url'],
  },
  BlogPosting: {
    required: ['headline', 'image', 'datePublished', 'author.name'],
    recommended: ['dateModified', 'author.url'],
  },
  NewsArticle: {
    required: ['headline', 'image', 'datePublished', 'author.name'],
    recommended: ['dateModified', 'author.url'],
  },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  Event: {
    required: ['name', 'startDate', 'location'],
    recommended: ['description', 'image', 'endDate', 'offers'],
  },
  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
    advice:
      'Google normally shows FAQ rich results only for authoritative government and health sites.',
  },
  JobPosting: {
    required: [
      'title',
      'description',
      'datePosted',
      'hiringOrganization.name',
      'jobLocation',
      'jobLocation.address.streetAddress',
      'jobLocation.address.addressLocality',
      'jobLocation.address.addressCountry',
    ],
    recommended: ['validThrough', 'employmentType', 'baseSalary'],
  },
  LocalBusiness: {
    required: [
      'name',
      'address.streetAddress',
      'address.addressLocality',
      'address.addressCountry',
    ],
    recommended: ['url', 'telephone', 'image'],
  },
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs'] },
  Person: {
    required: ['name'],
    recommended: ['url', 'sameAs'],
    advice:
      'Person is a general Schema.org identity type and does not create a Google rich result on its own.',
  },
  Product: {
    required: [
      'name',
      'offers.price',
      'offers.priceCurrency',
      'offers.availability',
    ],
    recommended: ['image', 'description', 'brand'],
  },
  Recipe: {
    required: ['name', 'image', 'recipeIngredient', 'recipeInstructions'],
    recommended: ['author', 'datePublished', 'prepTime', 'cookTime'],
  },
  Review: {
    required: [
      'author.name',
      'itemReviewed.@type',
      'itemReviewed.name',
      'reviewRating.ratingValue',
    ],
    recommended: ['reviewBody', 'datePublished'],
    advice:
      'The review and rating must be genuine and visible on the page. Google review stars are unavailable for self-controlled LocalBusiness or Organization reviews.',
  },
  VideoObject: {
    required: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    recommended: ['duration', 'contentUrl', 'embedUrl'],
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['alternateName'],
    advice:
      'Google uses WebSite markup for site names when it appears on the domain or subdomain home page. Site names are not supported in the Rich Results Test.',
  },
}

const PROFILE_ALIASES: Record<string, string> = {
  Restaurant: 'LocalBusiness',
  Store: 'LocalBusiness',
  ProfessionalService: 'LocalBusiness',
  MedicalBusiness: 'LocalBusiness',
  LodgingBusiness: 'LocalBusiness',
}

function atPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as JsonObject)[key]
          : undefined,
      value,
    )
}

function present(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== '' &&
    (!Array.isArray(value) || value.length > 0)
  )
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function issueLine(source: string, position: number): number {
  return source.slice(0, Math.max(0, position)).split('\n').length
}

function jsonBlocks(source: string): {
  format: 'json' | 'html' | 'unknown'
  blocks: string[]
} {
  const trimmed = source.trim().replace(/^\uFEFF/u, '')
  if (/^[[{]/u.test(trimmed)) return { format: 'json', blocks: [trimmed] }
  const blocks = [
    ...trimmed.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu,
    ),
  ].map((match) => match[1].trim())
  return { format: blocks.length ? 'html' : 'unknown', blocks }
}

function collectEntities(
  value: unknown,
  output: JsonObject[],
  contexts: WeakMap<JsonObject, unknown>,
  inheritedContext?: unknown,
): void {
  if (output.length > SCHEMA_MARKUP_LIMITS.entities) return
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEntities(item, output, contexts, inheritedContext)
    }
    return
  }
  if (!value || typeof value !== 'object') return
  const object = value as JsonObject
  const context = object['@context'] ?? inheritedContext
  if (present(object['@type'])) {
    output.push(object)
    contexts.set(object, context)
  }
  if (Array.isArray(object['@graph'])) {
    collectEntities(object['@graph'], output, contexts, context)
  }
}

function entityTypes(entity: JsonObject): string[] {
  const value = entity['@type']
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : []
}

export function validateSchemaMarkup(source: string): SchemaValidationReport {
  const issues: SchemaValidationIssue[] = []
  let issuesTruncated = false
  const add = (issue: SchemaValidationIssue) => {
    if (issues.length < SCHEMA_MARKUP_LIMITS.issues) issues.push(issue)
    else issuesTruncated = true
  }
  let dataStatus: 'complete' | 'partial' = 'complete'
  if (source.length > SCHEMA_MARKUP_LIMITS.characters) {
    add({
      severity: 'error',
      code: 'input-too-large',
      message: `The input exceeds the ${SCHEMA_MARKUP_LIMITS.characters.toLocaleString()} character limit.`,
    })
    dataStatus = 'partial'
    return {
      schema: 1,
      profile: {
        name: 'common-search-schema-types',
        reviewedAt: '2026-08-10',
        supportedTypes: [
          ...Object.keys(PROFILE_RULES),
          ...Object.keys(PROFILE_ALIASES),
        ],
      },
      valid: false,
      dataStatus,
      input: {
        characters: source.length,
        blocks: 0,
        format: 'unknown',
      },
      summary: {
        entities: 0,
        recognizedEntities: 0,
        errors: 1,
        warnings: 0,
        advice: 0,
      },
      entityTypes: [],
      issues,
      limits: SCHEMA_MARKUP_LIMITS,
    }
  }
  const parsed = jsonBlocks(source)
  if (!parsed.blocks.length)
    add({
      severity: 'error',
      code: 'no-json-ld',
      message: 'No JSON-LD object or application/ld+json script was found.',
    })
  if (parsed.blocks.length > SCHEMA_MARKUP_LIMITS.blocks) {
    add({
      severity: 'warning',
      code: 'block-limit',
      message: `Only the first ${SCHEMA_MARKUP_LIMITS.blocks} JSON-LD blocks were checked.`,
    })
    dataStatus = 'partial'
  }

  const entities: JsonObject[] = []
  const contexts = new WeakMap<JsonObject, unknown>()
  parsed.blocks
    .slice(0, SCHEMA_MARKUP_LIMITS.blocks)
    .forEach((block, index) => {
      try {
        const value = JSON.parse(block) as unknown
        const before = entities.length
        collectEntities(value, entities, contexts)
        if (entities.length === before && value && typeof value === 'object') {
          add({
            severity: 'error',
            code: 'missing-type',
            block: index + 1,
            path: '@type',
            message:
              'This JSON-LD block does not contain an entity with @type.',
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON.'
        const position = Number(message.match(/position\s+(\d+)/iu)?.[1])
        add({
          severity: 'error',
          code: 'invalid-json',
          block: index + 1,
          line: Number.isFinite(position)
            ? issueLine(block, position)
            : undefined,
          message,
        })
      }
    })

  if (entities.length > SCHEMA_MARKUP_LIMITS.entities) {
    add({
      severity: 'warning',
      code: 'entity-limit',
      message: `Only the first ${SCHEMA_MARKUP_LIMITS.entities} entities were checked.`,
    })
    dataStatus = 'partial'
    entities.length = SCHEMA_MARKUP_LIMITS.entities
  }

  const counts = new Map<string, number>()
  let recognizedEntities = 0
  entities.forEach((entity, index) => {
    const types = entityTypes(entity)
    types.forEach((type) => {
      counts.set(type, (counts.get(type) || 0) + 1)
    })
    const context = contexts.get(entity)
    if (
      context !== undefined &&
      !(
        typeof context === 'string' &&
        /^https?:\/\/(www\.)?schema\.org\/?$/iu.test(context)
      )
    ) {
      add({
        severity: 'warning',
        code: 'unexpected-context',
        path: `entities.${index}.@context`,
        message:
          'The @context is not the standard Schema.org URL. Generic Schema.org checks may not apply.',
      })
    }
    if (context === undefined)
      add({
        severity: 'error',
        code: 'missing-context',
        path: `entities.${index}.@context`,
        message: 'Add @context with the Schema.org URL.',
      })

    const observedType = types.find(
      (type) => PROFILE_RULES[type] || PROFILE_ALIASES[type],
    )
    if (!observedType) {
      add({
        severity: 'advice',
        code: 'unsupported-profile',
        path: `entities.${index}.@type`,
        message: `JSON syntax was checked for ${types.join(', ') || 'this entity'}, but this validator has no supported profile for that type.`,
      })
      return
    }
    recognizedEntities += 1
    const recognizedType = PROFILE_ALIASES[observedType] || observedType
    const rules = PROFILE_RULES[recognizedType]
    for (const path of rules.required) {
      if (!present(atPath(entity, path)))
        add({
          severity: 'error',
          code: 'missing-required-property',
          path: `entities.${index}.${path}`,
          message: `${recognizedType} is missing the required ${path} property for this validation profile.`,
        })
    }
    for (const path of rules.recommended) {
      if (!present(atPath(entity, path)))
        add({
          severity: 'warning',
          code: 'missing-recommended-property',
          path: `entities.${index}.${path}`,
          message: `${recognizedType} is missing the recommended ${path} property.`,
        })
    }
    if (rules.advice)
      add({
        severity: 'advice',
        code: 'feature-limitation',
        path: `entities.${index}`,
        message: rules.advice,
      })

    if (recognizedType === 'FAQPage' && Array.isArray(entity.mainEntity)) {
      entity.mainEntity.forEach((question, questionIndex) => {
        if (!question || typeof question !== 'object') return
        if (
          !present(atPath(question, 'name')) ||
          !present(atPath(question, 'acceptedAnswer.text'))
        )
          add({
            severity: 'error',
            code: 'incomplete-question',
            path: `entities.${index}.mainEntity.${questionIndex}`,
            message: 'Each FAQ question needs a name and acceptedAnswer.text.',
          })
      })
    }
    if (
      recognizedType === 'BreadcrumbList' &&
      Array.isArray(entity.itemListElement)
    ) {
      entity.itemListElement.forEach((item, itemIndex) => {
        if (
          !present(atPath(item, 'position')) ||
          !present(atPath(item, 'name'))
        )
          add({
            severity: 'error',
            code: 'incomplete-breadcrumb',
            path: `entities.${index}.itemListElement.${itemIndex}`,
            message: 'Each breadcrumb item needs position and name.',
          })
      })
    }
    if (recognizedType === 'Event') {
      const locations = Array.isArray(entity.location)
        ? entity.location
        : [entity.location]
      const hasUsefulLocation = locations.some(
        (location) =>
          present(atPath(location, 'url')) ||
          present(atPath(location, 'name')) ||
          present(atPath(location, 'address.streetAddress')) ||
          present(atPath(location, 'address.addressLocality')),
      )
      if (!hasUsefulLocation)
        add({
          severity: 'error',
          code: 'incomplete-location',
          path: `entities.${index}.location`,
          message:
            'Event location needs a venue name, address detail, or virtual location URL.',
        })
    }
    if (recognizedType === 'Review' || recognizedType === 'AggregateRating') {
      const rating =
        recognizedType === 'Review' ? atPath(entity, 'reviewRating') : entity
      const ratingValue = finiteNumber(atPath(rating, 'ratingValue'))
      const bestRating = finiteNumber(atPath(rating, 'bestRating')) ?? 5
      const worstRating = finiteNumber(atPath(rating, 'worstRating')) ?? 1
      if (bestRating <= worstRating) {
        add({
          severity: 'error',
          code: 'invalid-rating-scale',
          path: `entities.${index}${recognizedType === 'Review' ? '.reviewRating' : ''}`,
          message: 'bestRating must be greater than worstRating.',
        })
      } else if (
        ratingValue !== undefined &&
        (ratingValue < worstRating || ratingValue > bestRating)
      ) {
        add({
          severity: 'error',
          code: 'rating-out-of-range',
          path: `entities.${index}${recognizedType === 'Review' ? '.reviewRating.ratingValue' : '.ratingValue'}`,
          message:
            'ratingValue must be within the stated worstRating and bestRating range.',
        })
      }
      if (recognizedType === 'Review') {
        const authorName = atPath(entity, 'author.name')
        if (typeof authorName === 'string' && authorName.length >= 100) {
          add({
            severity: 'error',
            code: 'review-author-too-long',
            path: `entities.${index}.author.name`,
            message:
              'Google requires the review author name to be shorter than 100 characters.',
          })
        }
      } else {
        const ratingCount = finiteNumber(entity.ratingCount)
        const reviewCount = finiteNumber(entity.reviewCount)
        if (ratingCount === undefined && reviewCount === undefined) {
          add({
            severity: 'error',
            code: 'missing-rating-count',
            path: `entities.${index}`,
            message: 'AggregateRating needs ratingCount or reviewCount.',
          })
        }
        for (const [property, count] of [
          ['ratingCount', ratingCount],
          ['reviewCount', reviewCount],
        ] as const) {
          if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
            add({
              severity: 'error',
              code: 'invalid-rating-count',
              path: `entities.${index}.${property}`,
              message: `${property} must be a positive whole number.`,
            })
          }
        }
      }
    }
    if (recognizedType === 'WebSite' && typeof entity.url === 'string') {
      try {
        const url = new URL(entity.url)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new TypeError('Unsupported WebSite URL protocol.')
        }
        if (url.pathname !== '/' || url.search || url.hash) {
          add({
            severity: 'error',
            code: 'website-url-not-homepage',
            path: `entities.${index}.url`,
            message:
              'WebSite url must be the domain or subdomain home page without a path, query, or fragment.',
          })
        }
      } catch {
        add({
          severity: 'error',
          code: 'invalid-website-url',
          path: `entities.${index}.url`,
          message: 'WebSite url must be an absolute HTTP or HTTPS URL.',
        })
      }
    }
  })

  if (issuesTruncated) {
    dataStatus = 'partial'
    issues[issues.length - 1] = {
      severity: 'warning',
      code: 'issue-limit',
      message: `Only the first ${SCHEMA_MARKUP_LIMITS.issues - 1} findings were retained.`,
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const advice = issues.filter((issue) => issue.severity === 'advice').length
  return {
    schema: 1,
    profile: {
      name: 'common-search-schema-types',
      reviewedAt: '2026-08-10',
      supportedTypes: [
        ...Object.keys(PROFILE_RULES),
        ...Object.keys(PROFILE_ALIASES),
      ],
    },
    valid: errors === 0 && dataStatus === 'complete',
    dataStatus,
    input: {
      characters: source.length,
      blocks: Math.min(parsed.blocks.length, SCHEMA_MARKUP_LIMITS.blocks),
      format: parsed.format,
    },
    summary: {
      entities: entities.length,
      recognizedEntities,
      errors,
      warnings,
      advice,
    },
    entityTypes: [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => ({ type, count })),
    issues,
    limits: SCHEMA_MARKUP_LIMITS,
  }
}
