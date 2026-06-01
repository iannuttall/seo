import { readConfig } from '../storage/config.js'
import type { KeywordDataProvider } from '../types.js'
import { DataForSeoProvider } from './dataforseo.js'
import { SemrushProvider } from './semrush.js'

export function getKeywordProvider(
  prefer?: 'cheap' | 'authoritative',
): KeywordDataProvider | undefined {
  const config = readConfig()
  const chosen = prefer ?? config.providers.prefer

  if (chosen === 'authoritative' && config.providers.semrushApiKey) {
    return new SemrushProvider()
  }

  if (
    chosen === 'cheap' &&
    config.providers.dataForSeoLogin &&
    config.providers.dataForSeoPassword
  ) {
    return new DataForSeoProvider()
  }

  if (config.providers.semrushApiKey) {
    return new SemrushProvider()
  }

  if (config.providers.dataForSeoLogin && config.providers.dataForSeoPassword) {
    return new DataForSeoProvider()
  }

  return undefined
}
