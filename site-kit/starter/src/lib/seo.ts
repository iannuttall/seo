import {
  assembleGraph,
  buildBreadcrumbList,
  buildPiece,
  buildWebPage,
  buildWebSite,
  type GraphEntity,
  makeIds,
} from '@iannuttall/seo-graph-core'
import { absoluteUrl, site } from '../site'

export type Breadcrumb = { name: string; path: string }
export type Faq = { question: string; answer: string }

const ids = makeIds({ siteUrl: site.url })
const organisationId = ids.organization('site')

// One JSON-LD graph per page. Mark up only what the page shows.
export function pageGraph(input: {
  name: string
  description: string
  path: string
  breadcrumbs: Breadcrumb[]
  faqs?: Faq[]
}) {
  const url = absoluteUrl(input.path)
  const faqId = input.faqs?.length ? `${url}#faq` : null
  // A breadcrumb trail needs two steps. The home page has none.
  const crumbs = input.breadcrumbs.length > 1
  const pieces: GraphEntity[] = [
    buildPiece({
      '@type': 'Organization',
      '@id': organisationId,
      name: site.name,
      url: absoluteUrl('/'),
    }),
    buildWebSite(
      {
        url: absoluteUrl('/'),
        name: site.name,
        description: site.description,
        publisher: { '@id': organisationId },
        inLanguage: site.language,
      },
      ids,
    ),
    buildWebPage(
      {
        url,
        name: input.name,
        description: input.description,
        isPartOf: { '@id': ids.website },
        ...(crumbs ? { breadcrumb: { '@id': ids.breadcrumb(url) } } : {}),
        inLanguage: site.language,
        ...(faqId ? { mainEntity: [{ '@id': faqId }] } : {}),
      },
      ids,
    ),
  ]
  if (crumbs) {
    pieces.push(
      buildBreadcrumbList(
        {
          url,
          items: input.breadcrumbs.map((item) => ({
            name: item.name,
            url: absoluteUrl(item.path),
          })),
        },
        ids,
      ),
    )
  }
  if (faqId && input.faqs) {
    pieces.push(
      buildPiece({
        '@type': 'FAQPage',
        '@id': faqId,
        isPartOf: { '@id': ids.webPage(url) },
        mainEntity: input.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      }),
    )
  }
  return assembleGraph(pieces)
}

// Safe inside an inline script element.
export function serializeGraph(graph: unknown): string {
  return JSON.stringify(graph)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
