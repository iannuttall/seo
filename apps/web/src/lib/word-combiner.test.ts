import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateWordCombinations,
  WORD_COMBINER_LIMITS,
  wordCombinationsToCsv,
  wordCombinationsToTxt,
} from './word-combiner.ts'

test('generates deterministic fixed-order rows with formatting controls', () => {
  const result = generateWordCombinations({
    lists: ['best\nlocal', 'seo tools\nrank tracker'],
    pattern: 'all-lists',
    includeIndividuals: [],
    wordSeparator: '-',
    caseMode: 'uppercase',
    prefix: '[',
    suffix: ']',
    affixScope: 'combination',
    dedupe: true,
    include: '',
    exclude: '',
  })

  assert.deepEqual(result.rows, [
    '[BEST-SEO TOOLS]',
    '[BEST-RANK TRACKER]',
    '[LOCAL-SEO TOOLS]',
    '[LOCAL-RANK TRACKER]',
  ])
  assert.equal(result.projectedCount, '4')
  assert.equal(result.capped, false)
})

test('never processes more than the hard candidate cap', () => {
  const first = Array.from({ length: 317 }, (_, index) => `a${index}`).join(
    '\n',
  )
  const second = Array.from({ length: 317 }, (_, index) => `b${index}`).join(
    '\n',
  )
  const result = generateWordCombinations({
    lists: [first, second],
    pattern: 'all-lists',
    includeIndividuals: [],
    wordSeparator: ' ',
    caseMode: 'preserve',
    prefix: '',
    suffix: '',
    affixScope: 'combination',
    dedupe: true,
    include: '',
    exclude: '',
    candidateLimit: WORD_COMBINER_LIMITS.candidateCombinations * 2,
  })

  assert.equal(
    result.processedCandidates,
    WORD_COMBINER_LIMITS.candidateCombinations,
  )
  assert.equal(result.rows.length, WORD_COMBINER_LIMITS.candidateCombinations)
  assert.equal(result.capped, true)
})

test('renders copyable TXT and escaped CSV', () => {
  const rows = ['best seo tools', '"local", seo']

  assert.equal(wordCombinationsToTxt(rows), 'best seo tools\n"local", seo\n')
  assert.equal(
    wordCombinationsToTxt(rows, ' | '),
    'best seo tools | "local", seo',
  )
  assert.equal(
    wordCombinationsToCsv(rows),
    '"combination"\r\n"best seo tools"\r\n"""local"", seo"\r\n',
  )
})
