import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(appRoot, 'dist')
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
])

function staticFile(pathname) {
  const decoded = decodeURIComponent(pathname)
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const withIndex = extname(relative) ? relative : `${relative}/index.html`
  const target = resolve(dist, withIndex)
  assert.ok(target === dist || target.startsWith(`${dist}${sep}`))
  return target
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://local.test').pathname
      const file = staticFile(pathname)
      const body = await readFile(file)
      response.writeHead(200, {
        'content-type':
          contentTypes.get(extname(file)) || 'application/octet-stream',
      })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  }
}

async function assertSharedSelects(page, rootSelector) {
  const selects = page.locator(`${rootSelector} select`)
  const count = await selects.count()
  assert.ok(count > 0)
  for (let index = 0; index < count; index += 1) {
    assert.equal(
      await selects.nth(index).locator('xpath=..').locator('svg').count(),
      1,
    )
  }
}

async function assertCardsStack(page, rootSelector) {
  const cards = page.locator(`${rootSelector} > div`)
  assert.equal(await cards.count(), 2)
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()
    assert.ok(first && second)
    assert.ok(second.y >= first.y + first.height)
  }
}

test('planned browser tools use shared controls and complete their main workflows', {
  timeout: 45_000,
}, async (context) => {
  const server = await startStaticServer()
  context.after(server.close)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`${server.origin}/tools/seo-report-template`)
  const report = '[data-report-template-builder]'
  await assertSharedSelects(page, report)
  await assertCardsStack(page, report)
  assert.equal(await page.locator(`${report} [data-section]`).count(), 12)
  assert.match(
    await page.locator(`${report} [data-output]`).textContent(),
    /## Executive summary/u,
  )
  await page.locator(`${report} [data-format]`).selectOption('html')
  assert.match(
    await page.locator(`${report} [data-output]`).textContent(),
    /<!doctype html>/u,
  )
  await page.locator(`${report} [data-clear-sections]`).click()
  assert.match(
    await page.locator(`${report} [data-output-summary]`).textContent(),
    /^0 sections included/u,
  )

  await page.goto(`${server.origin}/tools/hreflang-generator`)
  const hreflang = '[data-hreflang-generator]'
  await assertSharedSelects(page, hreflang)
  await assertCardsStack(page, hreflang)
  await page.locator(`${hreflang} [data-use-example]`).click()
  assert.equal(await page.locator(`${hreflang} [data-hreflang-row]`).count(), 3)
  await page.locator(`${hreflang} [data-format]`).selectOption('sitemap')
  const sitemap = await page.locator(`${hreflang} [data-output]`).textContent()
  assert.equal(sitemap.match(/<url>/gu)?.length, 3)
  assert.equal(sitemap.match(/hreflang="en"/gu)?.length, 3)
  await page.locator(`${hreflang} [data-code]`).nth(1).fill('en')
  assert.equal(await page.locator(`${hreflang} [data-copy]`).isDisabled(), true)
  assert.match(
    await page.locator(`${hreflang} [data-result-summary]`).textContent(),
    /error/u,
  )

  let loadedSerpRequest
  let serpRequestMode = 'success'
  await page.route('**/api/tools/serp-preview', async (route) => {
    loadedSerpRequest = route.request().postDataJSON()
    if (serpRequestMode === 'unreachable') {
      await route.abort('failed')
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schema: 1,
        source: {
          finalUrl: 'https://loaded.example/guides/live-page',
        },
        metadata: {
          title: 'Loaded page title',
          description: 'Description loaded from the public page.',
          siteName: 'Loaded Journal',
          favicon: {
            status: 'found',
            dataUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
        },
        warnings: [],
      }),
    })
  })
  await page.goto(`${server.origin}/tools/serp-preview`)
  const serp = '[data-serp-preview]'
  await assertSharedSelects(page, serp)
  await assertCardsStack(page, serp)
  await page
    .locator(`${serp} [data-url]`)
    .fill('loaded.example/guides/live-page')
  await page.locator(`${serp} [data-url]`).press('Enter')
  await page.waitForFunction(
    () => document.querySelector('[data-title]')?.value === 'Loaded page title',
  )
  assert.deepEqual(loadedSerpRequest, {
    url: 'https://loaded.example/guides/live-page',
  })
  assert.equal(
    await page.locator(`${serp} [data-title]`).inputValue(),
    'Loaded page title',
  )
  assert.equal(
    await page.locator(`${serp} [data-description]`).inputValue(),
    'Description loaded from the public page.',
  )
  assert.equal(
    await page.locator(`${serp} [data-site-name]`).inputValue(),
    'Loaded Journal',
  )
  assert.equal(
    await page.locator(`${serp} [data-preview-favicon-image]`).isVisible(),
    true,
  )
  assert.equal(
    await page.locator(`${serp} [data-load-status]`).textContent(),
    'Page details loaded.',
  )
  assert.equal(
    await page.locator(`${serp} [data-load-status]`).getAttribute('role'),
    'status',
  )
  serpRequestMode = 'unreachable'
  await page.locator(`${serp} [data-load-page]`).click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-load-status]')?.textContent ===
      'Could not reach the preview server. Try again.',
  )
  assert.equal(
    await page.locator(`${serp} [data-load-status]`).getAttribute('role'),
    'alert',
  )
  assert.match(
    await page.locator(`${serp} [data-load-status]`).getAttribute('class'),
    /text-red-700/u,
  )
  serpRequestMode = 'success'
  await page.locator(`${serp} [data-use-example]`).click()
  assert.equal(
    await page.locator(`${serp} .serp-google-wordmark`).first().textContent(),
    'Google',
  )
  assert.match(
    await page.locator(`${serp} [data-preview-title]`).textContent(),
    /Coastal field notes/u,
  )
  assert.ok(
    (await page.locator(`${serp} [data-preview-title] mark`).count()) > 0,
  )
  assert.equal(
    await page.locator(`${serp} [data-preview-date]`).textContent(),
    'Aug 10, 2026',
  )
  assert.equal(
    await page.locator(`${serp} [data-preview-image]`).isVisible(),
    true,
  )
  assert.match(
    await page
      .locator(`${serp} [data-google-desktop-header] [data-google-search]`)
      .textContent(),
    /coastal field notes/u,
  )
  await page.locator(`${serp} [data-device]`).selectOption('mobile')
  assert.equal(
    await page.locator(`${serp} [data-google-desktop-header]`).isVisible(),
    false,
  )
  assert.equal(
    await page.locator(`${serp} [data-google-mobile-header]`).isVisible(),
    true,
  )
  await page.locator(`${serp} [data-title]`).fill('W'.repeat(120))
  assert.match(
    await page.locator(`${serp} [data-title-status]`).textContent(),
    /may shorten/u,
  )
  await page.locator(`${serp} [data-addition]`).selectOption('rating')
  assert.match(
    await page.locator(`${serp} [data-preview-stars]`).textContent(),
    /84 reviews/u,
  )
  assert.equal(
    await page.locator(`${serp} [data-preview-image]`).isVisible(),
    false,
  )
  assert.equal(
    await page
      .locator(`${serp} .serp-browser`)
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgb(255, 255, 255)',
  )
  assert.match(
    await page.locator(`${serp} [data-meta-output]`).textContent(),
    /<meta name="description"/u,
  )

  await page.goto(`${server.origin}/tools/canonical-checker`)
  const canonical = '[data-canonical-checker]'
  await assertCardsStack(page, canonical)
  await page.locator(`${canonical} [data-use-example]`).click()
  assert.equal(
    await page.locator(`${canonical} [data-verdict]`).textContent(),
    'One canonical link found',
  )
  assert.match(
    await page.locator(`${canonical} [data-resolved-tag]`).textContent(),
    /https:\/\/example\.com\/products\/field-mug/u,
  )
  assert.equal(
    await page.locator(`${canonical} [data-copy-tag]`).isDisabled(),
    false,
  )
  await page.locator(`${canonical} [data-open-serp]`).click()
  await page.waitForURL('**/tools/serp-preview?source=canonical')
  assert.equal(
    await page.locator(`${serp} [data-title]`).inputValue(),
    'Field mug for coastal surveys',
  )
  assert.match(
    await page.locator(`${serp} [data-description]`).inputValue(),
    /hard-wearing field mug/u,
  )

  assert.deepEqual(pageErrors, [])
})
