import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const tools = [
  {
    file: 'SeoReportTemplateBuilder.astro',
    components: ['Button', 'Card', 'FormInput', 'FormSelect'],
  },
  {
    file: 'HreflangGenerator.astro',
    components: ['Button', 'Card', 'FormInput', 'FormSelect'],
  },
  {
    file: 'SerpPreview.astro',
    components: ['Button', 'Card', 'FormInput', 'FormSelect', 'FormTextarea'],
  },
  {
    file: 'CanonicalChecker.astro',
    components: ['Button', 'Card', 'FormInput', 'FormTextarea'],
  },
]

for (const tool of tools) {
  test(`${tool.file} uses shared form and card components`, async () => {
    const source = await readFile(
      resolve(webRoot, 'src/components/tools', tool.file),
      'utf8',
    )

    for (const component of tool.components) {
      assert.match(source, new RegExp(`<${component}\\b`, 'u'))
    }
    assert.doesNotMatch(source, /<select\b/u)
    assert.doesNotMatch(source, /lg:grid-cols-2/u)
    assert.equal(source.match(/<Card\b/gu)?.length, 2)
  })
}
