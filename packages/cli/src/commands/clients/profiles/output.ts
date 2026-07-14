import type { ClientProfile } from '@seo/core'
import { printKeyValue, printSummaryList } from '../../../utils.js'

export function printClientList(clients: ClientProfile[]): void {
  printSummaryList(
    clients.map((client) => ({
      title: `${client.name}${client.isDefault ? ' (default)' : ''}`,
      description: client.siteUrl,
      meta: [
        client.id,
        client.startUrl ? `crawl ${client.startUrl}` : '',
        client.watchUrls.length
          ? `${client.watchUrls.length} watched URL${client.watchUrls.length === 1 ? '' : 's'}`
          : '',
        client.brandTerms.length
          ? `${client.brandTerms.length} brand term${client.brandTerms.length === 1 ? '' : 's'}`
          : '',
      ],
    })),
    { empty: 'No saved projects.' },
  )
}

export function printClientProfile(client: ClientProfile): void {
  printKeyValue([
    ['ID', client.id],
    ['Name', client.name],
    ['GSC property', client.siteUrl],
    ['Crawl URL', client.startUrl ?? 'not set'],
    ['Watch URLs', client.watchUrls.join(', ') || 'not set'],
    ['Brand terms', client.brandTerms.join(', ') || 'not set'],
    ['GA4 property', client.ga4PropertyId ?? 'not set'],
    ['Report day', client.reportDay ? String(client.reportDay) : 'not set'],
    [
      'Technical weekday',
      client.technicalWeekday === undefined
        ? 'not set'
        : String(client.technicalWeekday),
    ],
    ['Default', client.isDefault ? 'yes' : 'no'],
  ])
}
