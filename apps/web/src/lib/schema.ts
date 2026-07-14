import { site } from './site'

export type PageSchemaType = 'CollectionPage' | 'TechArticle' | 'WebPage'

export interface SchemaBreadcrumb {
  href?: string
  label: string
}

export interface PageSchemaInput {
  breadcrumbs?: readonly SchemaBreadcrumb[]
  canonical: string
  dateModified?: string
  datePublished?: string
  description: string
  title: string
  type?: PageSchemaType
}

const ids = {
  creator: `${site.url}/#creator`,
  software: `${site.url}/#software`,
  website: `${site.url}/#website`,
} as const

function absoluteUrl(href: string, canonical: string): string {
  return new URL(href, canonical).toString()
}

export function pageSchema(input: PageSchemaInput) {
  const canonical = new URL(input.canonical).toString()
  const pageId = `${canonical}#webpage`
  const page = {
    '@id': pageId,
    '@type': input.type ?? 'WebPage',
    url: canonical,
    name: input.title,
    description: input.description,
    inLanguage: 'en',
    isPartOf: { '@id': ids.website },
    about: { '@id': ids.software },
    creator: { '@id': ids.creator },
    publisher: { '@id': ids.creator },
    ...(canonical === new URL(site.url).toString()
      ? { mainEntity: { '@id': ids.software } }
      : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.breadcrumbs?.length
      ? { breadcrumb: { '@id': `${canonical}#breadcrumb` } }
      : {}),
  }

  const graph: Array<Record<string, unknown>> = [
    {
      '@id': ids.creator,
      '@type': 'Person',
      name: 'Ian Nuttall',
      url: 'https://ian.is',
      sameAs: ['https://github.com/iannuttall'],
    },
    {
      '@id': ids.website,
      '@type': 'WebSite',
      url: site.url,
      name: site.name,
      description: site.description,
      inLanguage: 'en',
      creator: { '@id': ids.creator },
      publisher: { '@id': ids.creator },
      about: { '@id': ids.software },
    },
    {
      '@id': ids.software,
      '@type': 'SoftwareApplication',
      name: site.name,
      alternateName: ['SEO CLI', 'SEO Skills CLI', 'SEO Skills', 'seo'],
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Linux, macOS, Windows',
      description: site.description,
      url: site.url,
      downloadUrl: site.npm,
      codeRepository: site.repository,
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      isAccessibleForFree: true,
      author: { '@id': ids.creator },
      sameAs: [site.repository, site.npm],
    },
    page,
  ]

  if (input.breadcrumbs?.length) {
    graph.push({
      '@id': `${canonical}#breadcrumb`,
      '@type': 'BreadcrumbList',
      itemListElement: input.breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.label,
        item: crumb.href ? absoluteUrl(crumb.href, canonical) : canonical,
      })),
    })
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
