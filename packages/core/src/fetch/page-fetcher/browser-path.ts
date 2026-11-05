import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PLAYWRIGHT_CORE_VERSION = '1.61.1'

export type BrowserExecutable = {
  path: string
  source: 'environment' | 'playwright-cache' | 'agent-browser-cache' | 'system'
  product: string
}

type BrowserPathDependencies = {
  environment?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
  fileExists?: (path: string) => boolean
  listDirectory?: (path: string) => string[]
}

export type BrowserPathResolution =
  | { status: 'available'; browser: BrowserExecutable }
  | { status: 'invalid-environment-path'; path: string }
  | { status: 'unavailable' }

function systemBrowserCandidates(input: {
  platform: NodeJS.Platform
  homeDirectory: string
  environment: NodeJS.ProcessEnv
}): BrowserExecutable[] {
  const macApplications = [
    '/Applications',
    join(input.homeDirectory, 'Applications'),
  ]
  if (input.platform === 'darwin') {
    return macApplications.flatMap((directory) => [
      {
        path: join(
          directory,
          'Google Chrome.app',
          'Contents',
          'MacOS',
          'Google Chrome',
        ),
        source: 'system' as const,
        product: 'Google Chrome',
      },
      {
        path: join(
          directory,
          'Google Chrome Beta.app',
          'Contents',
          'MacOS',
          'Google Chrome Beta',
        ),
        source: 'system' as const,
        product: 'Google Chrome Beta',
      },
      {
        path: join(directory, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        source: 'system' as const,
        product: 'Chromium',
      },
    ])
  }

  if (input.platform === 'win32') {
    const roots = [
      input.environment.LOCALAPPDATA,
      input.environment.PROGRAMFILES,
      input.environment['PROGRAMFILES(X86)'],
    ].filter((value): value is string => Boolean(value))
    return roots.flatMap((root) => [
      {
        path: join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        source: 'system' as const,
        product: 'Google Chrome',
      },
      {
        path: join(root, 'Chromium', 'Application', 'chrome.exe'),
        source: 'system' as const,
        product: 'Chromium',
      },
    ])
  }

  return [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].map((path) => ({
    path,
    source: 'system' as const,
    product: path.includes('google-chrome') ? 'Google Chrome' : 'Chromium',
  }))
}

function listDirectorySafely(path: string): string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

function versionParts(name: string): number[] {
  return (name.match(/\d+/g) ?? []).map(Number)
}

// Newest version first; the name breaks ties so listing order never matters.
function newestFirst(left: string, right: string): number {
  const a = versionParts(left)
  const b = versionParts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? -1) - (a[index] ?? -1)
    if (difference) return difference
  }
  return left < right ? -1 : left > right ? 1 : 0
}

const MAX_CACHED_BROWSER_VERSIONS = 20

function versionDirectories(
  root: string,
  prefix: string,
  listDirectory: (path: string) => string[],
): string[] {
  return listDirectory(root)
    .filter((name) => name.startsWith(prefix))
    .sort(newestFirst)
    .slice(0, MAX_CACHED_BROWSER_VERSIONS)
    .map((name) => join(root, name))
}

const CHROME_FOR_TESTING_APP = join(
  'Google Chrome for Testing.app',
  'Contents',
  'MacOS',
  'Google Chrome for Testing',
)

/**
 * Browsers that other local tools already downloaded: agent-browser keeps
 * Chrome for Testing builds and Playwright keeps one Chromium per revision.
 */
function cachedBrowserCandidates(input: {
  platform: NodeJS.Platform
  homeDirectory: string
  environment: NodeJS.ProcessEnv
  listDirectory: (path: string) => string[]
}): BrowserExecutable[] {
  const agentBrowserExecutables =
    input.platform === 'darwin'
      ? [CHROME_FOR_TESTING_APP]
      : input.platform === 'win32'
        ? ['chrome.exe']
        : ['chrome']
  const agentBrowser = versionDirectories(
    join(input.homeDirectory, '.agent-browser', 'browsers'),
    'chrome-',
    input.listDirectory,
  ).flatMap((directory) =>
    agentBrowserExecutables.map((executable) => ({
      path: join(directory, executable),
      source: 'agent-browser-cache' as const,
      product: 'agent-browser Chrome for Testing',
    })),
  )

  const configuredRoot = input.environment.PLAYWRIGHT_BROWSERS_PATH?.trim()
  const playwrightRoot =
    configuredRoot && configuredRoot !== '0'
      ? configuredRoot
      : input.platform === 'darwin'
        ? join(input.homeDirectory, 'Library', 'Caches', 'ms-playwright')
        : input.platform === 'win32'
          ? join(
              input.environment.LOCALAPPDATA ??
                join(input.homeDirectory, 'AppData', 'Local'),
              'ms-playwright',
            )
          : join(
              input.environment.XDG_CACHE_HOME ??
                join(input.homeDirectory, '.cache'),
              'ms-playwright',
            )
  const playwrightExecutables =
    input.platform === 'darwin'
      ? [
          join('chrome-mac-arm64', CHROME_FOR_TESTING_APP),
          join('chrome-mac-x64', CHROME_FOR_TESTING_APP),
          join('chrome-mac', CHROME_FOR_TESTING_APP),
          join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        ]
      : input.platform === 'win32'
        ? [join('chrome-win64', 'chrome.exe'), join('chrome-win', 'chrome.exe')]
        : [join('chrome-linux64', 'chrome'), join('chrome-linux', 'chrome')]
  const playwright = versionDirectories(
    playwrightRoot,
    'chromium-',
    input.listDirectory,
  ).flatMap((directory) =>
    playwrightExecutables.map((executable) => ({
      path: join(directory, executable),
      source: 'playwright-cache' as const,
      product: 'Playwright Chromium',
    })),
  )

  return [...agentBrowser, ...playwright]
}

/**
 * Resolve a browser without downloading one during normal package installation.
 * The explicit path wins so CI and managed workstations can select their own
 * supported browser deterministically.
 */
export function resolveBrowserExecutable(
  playwrightExecutablePath: string,
  dependencies: BrowserPathDependencies = {},
): BrowserPathResolution {
  const environment = dependencies.environment ?? process.env
  const fileExists = dependencies.fileExists ?? existsSync
  const configuredPath = environment.SEO_BROWSER_EXECUTABLE_PATH?.trim()
  if (configuredPath) {
    if (fileExists(configuredPath)) {
      return {
        status: 'available',
        browser: {
          path: configuredPath,
          source: 'environment',
          product: 'Configured Chromium browser',
        },
      }
    }
    return { status: 'invalid-environment-path', path: configuredPath }
  }

  if (fileExists(playwrightExecutablePath)) {
    return {
      status: 'available',
      browser: {
        path: playwrightExecutablePath,
        source: 'playwright-cache',
        product: 'Playwright Chromium',
      },
    }
  }

  const platform = dependencies.platform ?? process.platform
  const homeDirectory = dependencies.homeDirectory ?? homedir()
  const systemBrowser = systemBrowserCandidates({
    platform,
    homeDirectory,
    environment,
  }).find((candidate) => fileExists(candidate.path))
  if (systemBrowser) return { status: 'available', browser: systemBrowser }

  const candidates = cachedBrowserCandidates({
    platform,
    homeDirectory,
    environment,
    listDirectory: dependencies.listDirectory ?? listDirectorySafely,
  })
  const browser = candidates.find((candidate) => fileExists(candidate.path))
  return browser ? { status: 'available', browser } : { status: 'unavailable' }
}

export function browserInstallCommand(): string {
  return `npx --yes playwright@${PLAYWRIGHT_CORE_VERSION} install chromium`
}

export function browserUnavailableMessage(
  resolution: BrowserPathResolution,
): string {
  if (resolution.status === 'invalid-environment-path') {
    return 'SEO_BROWSER_EXECUTABLE_PATH does not point to a readable Chromium browser.'
  }
  return [
    'JavaScript rendering needs a local Chrome or Chromium browser.',
    `Install one, or run \`${browserInstallCommand()}\`.`,
    'Set SEO_BROWSER_EXECUTABLE_PATH to use a managed browser executable.',
  ].join(' ')
}
