import type { ClientProfile } from '@seo/core'
import { printKeyValue, printTable } from '../../../utils.js'

export function printClientList(clients: ClientProfile[]): void {
  printTable(
    [
      'Default',
      'ID',
      'Name',
      'GSC property',
      'Crawl URL',
      'Watch URLs',
      'Brand terms',
    ],
    clients.map((client) => [
      client.isDefault ? 'yes' : '',
      client.id,
      client.name,
      client.siteUrl,
      client.startUrl ?? '',
      client.watchUrls.length,
      client.brandTerms.join(', '),
    ]),
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
