import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('word combiner uses shared controls and keeps export actions above the result list', () => {
  const source = readFileSync(
    resolve(appRoot, 'src/components/tools/WordCombiner.astro'),
    'utf8',
  )

  assert.match(source, /import Button from '@\/components\/Button\.astro'/u)
  assert.match(
    source,
    /import DottedCard from '@\/components\/DottedCard\.astro'/u,
  )
  assert.match(
    source,
    /import FormInput from '@\/components\/FormInput\.astro'/u,
  )
  assert.match(
    source,
    /import FormSelect from '@\/components\/FormSelect\.astro'/u,
  )
  assert.match(
    source,
    /import FormTextarea from '@\/components\/FormTextarea\.astro'/u,
  )
  assert.match(
    source,
    /new Worker\(new URL\('\.\.\/\.\.\/workers\/word-combiner\.ts'/u,
  )
  assert.ok(source.indexOf('data-copy') < source.indexOf('data-result-rows'))
  assert.ok(
    source.indexOf('data-download="txt"') < source.indexOf('data-result-rows'),
  )
  assert.ok(
    source.indexOf('data-download="csv"') < source.indexOf('data-result-rows'),
  )
  assert.match(source, /const pageSize = 100/u)
  assert.match(source, /WORD_COMBINER_LIMITS\.lists/u)
  assert.match(source, /data-pattern/u)
  assert.match(source, /data-include-individual/u)
  assert.match(source, /data-word-separator/u)
  assert.match(source, /data-output-separator/u)
  assert.match(source, /data-affix-scope/u)
  assert.match(source, /<Button data-use-example/u)
  assert.match(source, /const exampleLists = \[/u)
  assert.match(
    source,
    /class="flex min-h-12 items-center gap-3 self-end font-sans text-sm font-medium"/u,
  )
  assert.doesNotMatch(
    source,
    /data-dedupe[\s\S]{0,120}border border-border bg-background/u,
  )
})
