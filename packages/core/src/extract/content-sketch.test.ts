import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentSketch, contentSketchCoverage } from './content-sketch.js'

const source = Array.from(
  { length: 120 },
  (_, index) => `section${index} explains a distinct useful detail`,
).join(' ')

test('content sketches are deterministic and bounded', () => {
  const first = contentSketch(source)
  const second = contentSketch(source)
  assert.deepEqual(first, second)
  assert.equal(first.hashes.length, 32)
  assert.equal(first.sampledShingles, 32)
})

test('content sketch coverage detects retained and omitted sections', () => {
  const sketch = contentSketch(source)
  assert.equal(contentSketchCoverage(sketch, source), 1)
  assert.ok(
    (contentSketchCoverage(sketch, source.split(' ').slice(0, 80).join(' ')) ??
      1) < 0.6,
  )
  assert.equal(contentSketchCoverage(contentSketch('too short'), source), null)
})
