import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface SeoCliPaths {
  configDir: string
  cacheDir: string
  logDir: string
  configFile: string
  tokensFile: string
  oauthClientFile: string
  telemetryStateFile: string
  cacheDbFile: string
}

let memoizedPaths: SeoCliPaths | undefined

export type SeoCliPathOptions = {
  env?: NodeJS.ProcessEnv
  home?: string
  platform?: NodeJS.Platform
}

function defaultConfigDir(input: Required<SeoCliPathOptions>): string {
  if (input.platform === 'win32') {
    return join(
      input.env.APPDATA ?? join(input.home, 'AppData', 'Roaming'),
      'seo',
      'Config',
    )
  }

  return join(input.env.XDG_CONFIG_HOME ?? join(input.home, '.config'), 'seo')
}

function defaultCacheDir(input: Required<SeoCliPathOptions>): string {
  if (input.platform === 'darwin') {
    return join(input.home, 'Library', 'Caches', 'seo')
  }
  if (input.platform === 'win32') {
    return join(
      input.env.LOCALAPPDATA ?? join(input.home, 'AppData', 'Local'),
      'seo',
      'Cache',
    )
  }
  return join(input.env.XDG_CACHE_HOME ?? join(input.home, '.cache'), 'seo')
}

function defaultLogDir(input: Required<SeoCliPathOptions>): string {
  if (input.platform === 'darwin') {
    return join(input.home, 'Library', 'Logs', 'seo')
  }
  if (input.platform === 'win32') {
    return join(
      input.env.LOCALAPPDATA ?? join(input.home, 'AppData', 'Local'),
      'seo',
      'Log',
    )
  }
  return join(
    input.env.XDG_STATE_HOME ?? join(input.home, '.local', 'state'),
    'seo',
  )
}

function resolvedPathOptions(
  input: SeoCliPathOptions,
): Required<SeoCliPathOptions> {
  return {
    env: input.env ?? process.env,
    home: input.home ?? homedir(),
    platform: input.platform ?? process.platform,
  }
}

export function resolveSeoCliPaths(input: SeoCliPathOptions = {}): SeoCliPaths {
  const options = resolvedPathOptions(input)
  const configDir = options.env.SEO_CONFIG_DIR ?? defaultConfigDir(options)
  const cacheDir = options.env.SEO_CACHE_DIR ?? defaultCacheDir(options)
  const logDir = options.env.SEO_LOG_DIR ?? defaultLogDir(options)

  return {
    configDir,
    cacheDir,
    logDir,
    configFile: join(configDir, 'config.json'),
    tokensFile: join(configDir, 'tokens.json'),
    oauthClientFile: join(configDir, 'oauth-client.json'),
    telemetryStateFile: join(configDir, 'telemetry.json'),
    cacheDbFile: join(cacheDir, 'cache.db'),
  }
}

function legacyMacConfigDir(input: SeoCliPathOptions): string | undefined {
  const options = resolvedPathOptions(input)
  if (
    options.platform !== 'darwin' ||
    options.env.SEO_CONFIG_DIR ||
    options.env.XDG_CONFIG_HOME
  ) {
    return undefined
  }
  return join(options.home, 'Library', 'Preferences', 'seo')
}

export function migrateLegacyMacConfig(input: SeoCliPathOptions = {}): void {
  const legacyDir = legacyMacConfigDir(input)
  if (!legacyDir) return

  const paths = resolveSeoCliPaths(input)
  if (!existsSync(legacyDir) || existsSync(paths.configDir)) return

  try {
    mkdirSync(dirname(paths.configDir), { recursive: true, mode: 0o700 })
    renameSync(legacyDir, paths.configDir)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EEXIST' && code !== 'ENOENT') throw error
  }
}

export function getSeoCliPaths(): SeoCliPaths {
  if (memoizedPaths) {
    return memoizedPaths
  }

  memoizedPaths = resolveSeoCliPaths()

  return memoizedPaths
}

export function ensureSeoCliDirs(): SeoCliPaths {
  const paths = getSeoCliPaths()
  migrateLegacyMacConfig()
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
