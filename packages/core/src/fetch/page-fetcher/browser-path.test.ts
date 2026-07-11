import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  browserInstallCommand,
  browserUnavailableMessage,
  resolveBrowserExecutable,
} from './browser-path.js'

test('browser path prefers an explicit managed browser', () => {
  const result = resolveBrowserExecutable('/playwright/chromium', {
    environment: { SEO_BROWSER_EXECUTABLE_PATH: '/managed/chrome' },
    fileExists: (path) => path === '/managed/chrome',
  })

  assert.deepEqual(result, {
    status: 'available',
    browser: {
      path: '/managed/chrome',
      source: 'environment',
      product: 'Configured Chromium browser',
    },
  })
})

test('browser path refuses an invalid explicit browser path', () => {
  const result = resolveBrowserExecutable('/playwright/chromium', {
    environment: { SEO_BROWSER_EXECUTABLE_PATH: '/missing/chrome' },
    fileExists: () => false,
  })

  assert.deepEqual(result, {
    status: 'invalid-environment-path',
    path: '/missing/chrome',
  })
  assert.equal(
    browserUnavailableMessage(result),
    'SEO_BROWSER_EXECUTABLE_PATH does not point to a readable Chromium browser.',
  )
})

test('browser path reuses a matching Playwright browser before system Chrome', () => {
  const result = resolveBrowserExecutable('/playwright/chromium', {
    environment: {},
    fileExists: (path) => path === '/playwright/chromium',
  })

  assert.deepEqual(result, {
    status: 'available',
    browser: {
      path: '/playwright/chromium',
      source: 'playwright-cache',
      product: 'Playwright Chromium',
    },
  })
})

test('browser path finds a supported system browser without a download', () => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const result = resolveBrowserExecutable('/playwright/chromium', {
    environment: {},
    platform: 'darwin',
    homeDirectory: '/Users/example',
    fileExists: (path) => path === chrome,
  })

  assert.deepEqual(result, {
    status: 'available',
    browser: {
      path: chrome,
      source: 'system',
      product: 'Google Chrome',
    },
  })
})

test('browser absence gives a package-safe install command', () => {
  const result = resolveBrowserExecutable('/playwright/chromium', {
    environment: {},
    fileExists: () => false,
  })

  assert.deepEqual(result, { status: 'unavailable' })
  assert.equal(
    browserInstallCommand(),
    'npx --yes playwright@1.61.1 install chromium',
  )
  assert.match(
    browserUnavailableMessage(result),
    /npx --yes playwright@1\.61\.1 install chromium/,
  )
  assert.doesNotMatch(browserUnavailableMessage(result), /pnpm add -w/)
})
