import type { GoogleRichResultAssessment } from '../types.js'

type SupportedType = GoogleRichResultAssessment['schemaType']

const SUPPORTED_TYPES = new Set<SupportedType>([
  'Article',
  'BlogPosting',
  'NewsArticle',
  'Product',
  'BreadcrumbList',
  'FAQPage',
])

function isSupportedType(value: string): value is SupportedType {
  return SUPPORTED_TYPES.has(value as SupportedType)
}

const ARTICLE_DOC =
  'https://developers.google.com/search/docs/appearance/structured-data/article'
const PRODUCT_DOC =
  'https://developers.google.com/search/docs/appearance/structured-data/product-snippet'
const BREADCRUMB_DOC =
  'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb'
const FAQ_DOC =
  'https://developers.google.com/search/updates#removing-faq-rich-result'

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(hasValue)
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.values(value as Record<string, unknown>).some(hasValue),
  )
}

function observedProperties(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((key) => !key.startsWith('@') && hasValue(record[key]))
    .sort()
}

function baseAssessment(
  input: {
    block: number
    path: string
    schemaType: SupportedType
  },
  feature: GoogleRichResultAssessment['feature'],
  record: Record<string, unknown>,
  documentationUrl: string,
): Omit<
  GoogleRichResultAssessment,
  'status' | 'missingRequiredProperties' | 'limitations'
> {
  return {
    format: 'json-ld',
    block: input.block,
    path: input.path,
    schemaType: input.schemaType,
    feature,
    observedProperties: observedProperties(record),
    documentationUrl,
  }
}

function productAssessment(
  input: { block: number; path: string; schemaType: 'Product' },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  const missing: string[] = []
  if (!hasValue(record.name)) missing.push('name')
  if (![record.review, record.aggregateRating, record.offers].some(hasValue)) {
    missing.push('one of review, aggregateRating, or offers')
  }
  return {
    ...baseAssessment(input, 'product-snippet', record, PRODUCT_DOC),
    status: missing.length
      ? 'missing-required-properties'
      : 'required-properties-observed',
    missingRequiredProperties: missing,
    limitations: [
      'This checks only Product-level required property presence. Nested Review, AggregateRating, Offer, and policy requirements are not validated.',
      'Visible-content parity, crawlability, Search policies, and actual rich-result eligibility require Google validation.',
    ],
  }
}

function breadcrumbAssessment(
  input: { block: number; path: string; schemaType: 'BreadcrumbList' },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  const rawItems = record.itemListElement
  const items = Array.isArray(rawItems) ? rawItems : []
  const missing: string[] = []
  if (items.length < 2) {
    missing.push('itemListElement with at least two ListItem values')
  }
  items.forEach((value, index) => {
    if (!value || typeof value !== 'object') {
      missing.push(`itemListElement[${index}] ListItem object`)
      return
    }
    const item = value as Record<string, unknown>
    if (!Number.isInteger(item.position) || Number(item.position) < 1) {
      missing.push(`itemListElement[${index}].position`)
    }
    const target = item.item
    const targetName =
      target && typeof target === 'object'
        ? (target as Record<string, unknown>).name
        : undefined
    if (!hasValue(item.name) && !hasValue(targetName)) {
      missing.push(`itemListElement[${index}].name`)
    }
    if (index < items.length - 1 && !hasValue(target)) {
      missing.push(`itemListElement[${index}].item`)
    }
  })
  return {
    ...baseAssessment(input, 'breadcrumb', record, BREADCRUMB_DOC),
    status: missing.length
      ? 'missing-required-properties'
      : 'required-properties-observed',
    missingRequiredProperties: missing,
    limitations: [
      'This checks required breadcrumb property presence, not URL validity, visible breadcrumb parity, crawlability, or Search policies.',
      'Observed properties do not guarantee that Google will show a breadcrumb rich result.',
    ],
  }
}

function articleAssessment(
  input: {
    block: number
    path: string
    schemaType: 'Article' | 'BlogPosting' | 'NewsArticle'
  },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  return {
    ...baseAssessment(input, 'article', record, ARTICLE_DOC),
    status: 'no-required-properties',
    missingRequiredProperties: [],
    limitations: [
      'Google currently lists no required Article properties; author, dates, headline, and image are recommended where applicable.',
      'Visible-content parity, image crawlability, Search policies, and actual appearance are not verified.',
    ],
  }
}

function faqAssessment(
  input: { block: number; path: string; schemaType: 'FAQPage' },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  return {
    ...baseAssessment(input, 'faq', record, FAQ_DOC),
    status: 'retired',
    missingRequiredProperties: [],
    limitations: [
      'Google says the FAQ rich-result feature stopped appearing in Search on May 7, 2026 and removed its documentation in June 2026.',
      'FAQPage can remain machine-readable Schema.org markup, but it is not a current Google rich-result opportunity.',
    ],
  }
}

export function assessGoogleRichResults(input: {
  block: number
  path: string
  nodeTypes: string[]
  record: Record<string, unknown>
}): GoogleRichResultAssessment[] {
  return input.nodeTypes.flatMap((schemaType) => {
    if (schemaType === 'Product') {
      return [productAssessment({ ...input, schemaType }, input.record)]
    }
    if (schemaType === 'BreadcrumbList') {
      return [breadcrumbAssessment({ ...input, schemaType }, input.record)]
    }
    if (
      schemaType === 'Article' ||
      schemaType === 'BlogPosting' ||
      schemaType === 'NewsArticle'
    ) {
      return [articleAssessment({ ...input, schemaType }, input.record)]
    }
    if (schemaType === 'FAQPage') {
      return [faqAssessment({ ...input, schemaType }, input.record)]
    }
    return []
  })
}

export function unassessedGoogleRichResult(input: {
  format: 'microdata' | 'rdfa'
  schemaType: string
}): GoogleRichResultAssessment[] {
  if (!isSupportedType(input.schemaType)) return []
  const schemaType = input.schemaType
  const metadata = (() => {
    if (schemaType === 'Product') {
      return {
        feature: 'product-snippet' as const,
        documentationUrl: PRODUCT_DOC,
      }
    }
    if (schemaType === 'BreadcrumbList') {
      return {
        feature: 'breadcrumb' as const,
        documentationUrl: BREADCRUMB_DOC,
      }
    }
    if (
      schemaType === 'Article' ||
      schemaType === 'BlogPosting' ||
      schemaType === 'NewsArticle'
    ) {
      return { feature: 'article' as const, documentationUrl: ARTICLE_DOC }
    }
    if (schemaType === 'FAQPage') {
      return { feature: 'faq' as const, documentationUrl: FAQ_DOC }
    }
    return undefined
  })()
  if (!metadata) return []
  return [
    {
      format: input.format,
      path: `${input.format}:${schemaType}`,
      schemaType,
      feature: metadata.feature,
      status: 'not-assessed',
      observedProperties: [],
      missingRequiredProperties: [],
      limitations: [
        `${input.format} type evidence was detected, but property-level extraction is not available for this format.`,
        'No rich-result completeness or eligibility conclusion was made.',
      ],
      documentationUrl: metadata.documentationUrl,
    },
  ]
}
