import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import envPaths from 'env-paths'

export interface SeoCliPaths {
  configDir: string
  cacheDir: string
  logDir: string
  configFile: string
  tokensFile: string
  oauthClientFile: string
  cacheDbFile: string
}

let memoizedPaths: SeoCliPaths | undefined

export function getSeoCliPaths(): SeoCliPaths {
  if (memoizedPaths) {
    return memoizedPaths
  }

  const override = process.env.SEO_CONFIG_DIR
  const paths = envPaths('seo', { suffix: '' })
  const configDir = override ?? paths.config
  const cacheDir = process.env.SEO_CACHE_DIR ?? paths.cache
  const logDir = process.env.SEO_LOG_DIR ?? paths.log

  memoizedPaths = {
    configDir,
    cacheDir,
    logDir,
    configFile: join(configDir, 'config.json'),
    tokensFile: join(configDir, 'tokens.json'),
    oauthClientFile: join(configDir, 'oauth-client.json'),
    cacheDbFile: join(cacheDir, 'cache.db'),
  }

  return memoizedPaths
}

export function ensureSeoCliDirs(): SeoCliPaths {
  const paths = getSeoCliPaths()
  mkdirSync(paths.configDir, { recursive: true, mode: 0o700 })
  mkdirSync(paths.cacheDir, { recursive: true, mode: 0o700 })
  mkdirSync(paths.logDir, { recursive: true, mode: 0o700 })
  return paths
}

export function fileSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
