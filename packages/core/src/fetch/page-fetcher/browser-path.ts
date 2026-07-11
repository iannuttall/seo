import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PLAYWRIGHT_CORE_VERSION = '1.61.1'

export type BrowserExecutable = {
  path: string
  source: 'environment' | 'playwright-cache' | 'system'
  product: string
}

type BrowserPathDependencies = {
  environment?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
  fileExists?: (path: string) => boolean
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

  const candidates = systemBrowserCandidates({
    platform: dependencies.platform ?? process.platform,
    homeDirectory: dependencies.homeDirectory ?? homedir(),
    environment,
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
