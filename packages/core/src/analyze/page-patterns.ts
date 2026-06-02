import type { GscRow } from '../types.js'

export type PageTemplate = {
  id: string
  label: string
  confidence: 'high' | 'medium' | 'low'
}

export type TemplateSummary = {
  id: string
  label: string
  count: number
  sampleUrls: string[]
}

export type PageTemplateFamily = {
  id: string
  label: string
  count: number
  share: number
  template: PageTemplate
}

const LOCAL_QUERY_TERMS = [
  'near me',
  'today',
  'tonight',
  'calendar',
  'schedule',
  'time',
  'times',
  'high tide',
  'low tide',
  'tide chart',
  'tide times',
  'salary in',
  'average salary',
]

const GENERIC_TEMPLATE_TERMS = [
  'last name',
  'surname',
  'meaning',
  'origin',
  'popularity',
  'how rare',
  'my last name',
  'salary',
  'wage',
  'pay',
  'tide',
]

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pathParts(url: string): string[] {
  return (parseUrl(url)?.pathname ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function detectPageTemplate(url: string): PageTemplate {
  const parts = pathParts(url)
  const path = `/${parts.join('/')}/`

  if (path.includes('/last-names/') && path.endsWith('-surname-popularity/')) {
    return {
      id: 'example-site-surname',
      label: 'ExampleSite surname page',
      confidence: 'high',
    }
  }

  if (
    path.includes('/first-names/') &&
    path.endsWith('-meaning-and-history/')
  ) {
    return {
      id: 'example-site-first-name',
      label: 'ExampleSite first-name page',
      confidence: 'high',
    }
  }

  if (/\/average-[a-z0-9-]+-salary-in-[a-z0-9-]+\//.test(path)) {
    const locationDepth = parts.length >= 2 ? 'city' : 'country'
    return {
      id: `example-site-${locationDepth}-salary`,
      label: `ExampleSite ${locationDepth} salary page`,
      confidence: 'high',
    }
  }

  if (path.includes('/salary-calculator/')) {
    return {
      id: 'example-site-calculator',
      label: 'ExampleSite salary calculator',
      confidence: 'high',
    }
  }

  if (parts.length >= 3 && !parts[0]?.includes('.')) {
    const host = parseUrl(url)?.hostname ?? ''
    if (host.includes('example.org')) {
      return {
        id: 'example-site-location',
        label: 'ExampleSite location page',
        confidence: 'high',
      }
    }
  }

  if (path.startsWith('/tools/')) {
    return { id: 'tool-page', label: 'Tool page', confidence: 'medium' }
  }

  return { id: 'other', label: 'Other page', confidence: 'low' }
}

export function summarizeTemplates(
  items: Array<{ url?: string; template?: PageTemplate }>,
  limit = 5,
): TemplateSummary[] {
  const byTemplate = new Map<string, TemplateSummary>()
  for (const item of items) {
    const template = item.template ?? detectPageTemplate(item.url ?? '')
    const existing = byTemplate.get(template.id) ?? {
      id: template.id,
      label: template.label,
      count: 0,
      sampleUrls: [],
    }
    existing.count += 1
    if (item.url && existing.sampleUrls.length < 3) {
      existing.sampleUrls.push(item.url)
    }
    byTemplate.set(template.id, existing)
  }
  return [...byTemplate.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function isQuotedQuery(query: string): boolean {
  return /["“”]/.test(query)
}

export function isLikelyLocalOrEntityIntent(query: string): boolean {
  const normalized = normalizeText(query)
  return LOCAL_QUERY_TERMS.some((term) => normalized.includes(term))
}

export function isLikelyGenericTemplateQuery(query: string): boolean {
  const normalized = normalizeText(query)
  return GENERIC_TEMPLATE_TERMS.some((term) => normalized.includes(term))
}

export function dominantTemplate(rows: GscRow[]): {
  template: PageTemplate
  share: number
} {
  const counts = new Map<string, { template: PageTemplate; count: number }>()
  for (const row of rows) {
    const template = detectPageTemplate(row.keys[1] ?? '')
    const existing = counts.get(template.id) ?? { template, count: 0 }
    existing.count += 1
    counts.set(template.id, existing)
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  if (!top) {
    return { template: detectPageTemplate(''), share: 0 }
  }
  return { template: top.template, share: top.count / rows.length }
}

export function templateFamilyId(template: PageTemplate): string {
  if (template.id.startsWith('example-site-')) return 'example-site-salary'
  if (template.id.startsWith('example-site-')) return template.id
  return template.id
}

function templateFamilyLabel(template: PageTemplate): string {
  if (template.id.startsWith('example-site-')) {
    return 'ExampleSite salary page'
  }
  return template.label
}

export function dominantTemplateFamily(rows: GscRow[]): PageTemplateFamily {
  const counts = new Map<string, PageTemplateFamily>()
  for (const row of rows) {
    const template = detectPageTemplate(row.keys[1] ?? '')
    const id = templateFamilyId(template)
    const existing = counts.get(id) ?? {
      id,
      label: templateFamilyLabel(template),
      count: 0,
      share: 0,
      template,
    }
    existing.count += 1
    counts.set(id, existing)
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  if (!top) {
    return {
      id: 'other',
      label: 'Other page',
      count: 0,
      share: 0,
      template: detectPageTemplate(''),
    }
  }
  return { ...top, share: top.count / rows.length }
}
