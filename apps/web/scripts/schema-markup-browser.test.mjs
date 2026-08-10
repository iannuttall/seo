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
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
])

const typeContracts = [
  ['aggregate-rating', 'Aggregate rating', 'AggregateRating'],
  ['article', 'Article', 'Article'],
  ['breadcrumb', 'Breadcrumb', 'BreadcrumbList'],
  ['event', 'Event', 'Event'],
  ['faq', 'FAQ page', 'FAQPage'],
  ['job-posting', 'Job posting', 'JobPosting'],
  ['local-business', 'Local business', 'LocalBusiness'],
  ['organization', 'Organization', 'Organization'],
  ['person', 'Person', 'Person'],
  ['product', 'Product', 'Product'],
  ['recipe', 'Recipe', 'Recipe'],
  ['review', 'Review', 'Review'],
  ['video', 'Video', 'VideoObject'],
  ['website', 'Website', 'WebSite'],
]

function outputJson(source) {
  const start = source.indexOf('\n')
  const end = source.lastIndexOf('\n')
  assert.ok(start >= 0 && end > start, 'generated output contains JSON-LD')
  return JSON.parse(source.slice(start + 1, end))
}

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

test('schema generator UI switches every type, manages repeaters, and hands off to validation', {
  timeout: 30_000,
}, async (context) => {
  const server = await startStaticServer()
  context.after(server.close)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`${server.origin}/tools/schema-markup-generator`)
  const root = page.locator('[data-schema-generator]')
  const typeSelect = root.locator('[data-schema-type]')
  await typeSelect.waitFor()

  assert.deepEqual(
    await typeSelect
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => [option.value, option.textContent?.trim()]),
      ),
    typeContracts.map(([id, label]) => [id, label]),
  )

  const cards = root.locator(':scope > div')
  assert.equal(await cards.count(), 2)
  const formCard = await cards.nth(0).boundingBox()
  const outputCard = await cards.nth(1).boundingBox()
  assert.ok(formCard && outputCard)
  assert.ok(outputCard.y >= formCard.y + formCard.height)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileFormCard = await cards.nth(0).boundingBox()
  const mobileOutputCard = await cards.nth(1).boundingBox()
  assert.ok(mobileFormCard && mobileOutputCard)
  assert.ok(mobileOutputCard.y >= mobileFormCard.y + mobileFormCard.height)
  await page.setViewportSize({ width: 1280, height: 900 })

  for (const [id, label, schemaType] of typeContracts) {
    await typeSelect.selectOption(id)
    const visibleForm = root.locator('[data-schema-form]:not([hidden])')
    assert.equal(await visibleForm.count(), 1)
    assert.equal(await visibleForm.getAttribute('data-schema-form-type'), id)
    assert.equal(await root.locator('[data-type-name]').textContent(), label)
    const generated = outputJson(
      (await root.locator('[data-output]').textContent()) || '',
    )
    assert.equal(generated['@context'], 'https://schema.org')
    assert.equal(generated['@type'], schemaType)
  }

  await typeSelect.selectOption('faq')
  const faq = root.locator('[data-schema-form-type="faq"]')
  const questions = faq.locator('[data-repeater-section="questions"]')
  assert.equal(await questions.locator('[data-repeat-row]').count(), 1)
  await questions.locator('[data-add-row]').click()
  assert.equal(await questions.locator('[data-repeat-row]').count(), 2)
  await questions
    .locator('[name="questions.0.question"]')
    .fill('What is recorded?')
  await questions
    .locator('[name="questions.0.answer"]')
    .fill('Visible wildlife observations.')
  await questions
    .locator('[name="questions.1.question"]')
    .fill('Where is it recorded?')
  await questions
    .locator('[name="questions.1.answer"]')
    .fill('On the public field page.')
  assert.deepEqual(
    outputJson(
      (await root.locator('[data-output]').textContent()) || '',
    ).mainEntity.map((question) => question.name),
    ['What is recorded?', 'Where is it recorded?'],
  )
  await questions
    .locator('[data-repeat-row]')
    .nth(0)
    .locator('[data-remove-row]')
    .click()
  assert.equal(await questions.locator('[data-repeat-row]').count(), 1)
  assert.equal(
    await questions.locator('input').first().getAttribute('name'),
    'questions.0.question',
  )

  await typeSelect.selectOption('breadcrumb')
  const breadcrumbs = root.locator(
    '[data-schema-form-type="breadcrumb"] [data-repeater-section="items"]',
  )
  assert.equal(await breadcrumbs.locator('[data-repeat-row]').count(), 2)
  await breadcrumbs.locator('[data-add-row]').click()
  assert.equal(await breadcrumbs.locator('[data-repeat-row]').count(), 3)
  await breadcrumbs
    .locator('[data-repeat-row]')
    .nth(2)
    .locator('[data-remove-row]')
    .click()
  assert.equal(await breadcrumbs.locator('[data-repeat-row]').count(), 2)

  await typeSelect.selectOption('website')
  const website = root.locator('[data-schema-form-type="website"]')
  await website.locator('[name="name"]').fill('Field Journal')
  await website.locator('[name="url"]').fill('https://example.com/')
  await website.locator('[name="alternateName"]').fill('FJ\nexample.com')
  await root.locator('[data-validate-generated]').click()
  await page.waitForURL('**/tools/schema-markup-validator?source=generator')

  const validator = page.locator('[data-schema-validator]')
  const transferred = await validator.locator('[data-input]').inputValue()
  assert.deepEqual(JSON.parse(transferred), {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Field Journal',
    url: 'https://example.com/',
    alternateName: ['FJ', 'example.com'],
  })
  await assert.doesNotReject(async () =>
    validator.locator('[data-results]').waitFor({ state: 'visible' }),
  )
  assert.equal(await validator.locator('[data-errors]').textContent(), '0')
  assert.equal(
    await validator.locator('[data-verdict]').textContent(),
    'Markup passed these checks',
  )

  assert.deepEqual(pageErrors, [])
})
