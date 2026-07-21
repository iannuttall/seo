import { readConfig } from '../storage/config.js'
import type { AppConfig, KeywordDataProvider } from '../types.js'
import { readDataForSeoCredentials } from './dataforseo/credentials.js'
import { DataForSeoProvider } from './dataforseo.js'
import { SemrushProvider } from './semrush.js'

export async function getKeywordProvider(
  prefer?: 'cheap' | 'authoritative',
  dependencies: {
    readConfig?: () => AppConfig
    hasDataForSeoCredentials?: () => boolean | Promise<boolean>
  } = {},
): Promise<KeywordDataProvider | undefined> {
  const config = (dependencies.readConfig ?? readConfig)()
  const chosen = prefer ?? config.providers.prefer

  if (chosen === 'authoritative' && config.providers.semrushApiKey) {
    return new SemrushProvider()
  }

  const hasDataForSeo = await (
    dependencies.hasDataForSeoCredentials ??
    (async () => Boolean(await readDataForSeoCredentials()))
  )()

  if (chosen === 'cheap' && hasDataForSeo) {
    return new DataForSeoProvider()
  }

  if (config.providers.semrushApiKey) {
    return new SemrushProvider()
  }

  if (hasDataForSeo) {
    return new DataForSeoProvider()
  }

  return undefined
}
