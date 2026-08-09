import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateWordCombinations,
  projectWordCombinationCount,
  WORD_COMBINER_LIMITS,
  wordCombinationsToCsv,
  wordCombinationsToTxt,
} from './word-combiner.ts'

test('projects combinations from populated lists and removes duplicate inputs', () => {
  const projection = projectWordCombinationCount([
    'best\nbest\ncheap',
    'seo tool\nrank tracker',
    '',
  ])

  assert.equal(projection.total, 4n)
  assert.equal(projection.populatedLists, 2)
  assert.deepEqual(projection.listCounts, [2, 2])
  assert.equal(projection.duplicateInputsRemoved, 1)
})

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

test('applies include and exclude filters without scanning beyond the cap', () => {
  const result = generateWordCombinations({
    lists: ['best\ncheap', 'seo\nppc'],
    pattern: 'all-lists',
    includeIndividuals: [],
    wordSeparator: ' ',
    caseMode: 'preserve',
    prefix: '',
    suffix: '',
    affixScope: 'combination',
    dedupe: true,
    include: 'seo',
    exclude: 'cheap',
    candidateLimit: 3,
  })

  assert.deepEqual(result.rows, ['best seo'])
  assert.equal(result.processedCandidates, 3)
  assert.equal(result.capped, true)
})

test('deduplicates rows after case conversion', () => {
  const result = generateWordCombinations({
    lists: ['SEO\nseo', 'Tool'],
    pattern: 'all-lists',
    includeIndividuals: [],
    wordSeparator: ' ',
    caseMode: 'lowercase',
    prefix: '',
    suffix: '',
    affixScope: 'combination',
    dedupe: true,
    include: '',
    exclude: '',
  })

  assert.deepEqual(result.rows, ['seo tool'])
})

test('projects progressive and adjacent patterns with selected individual lists', () => {
  const lists = ['a1\na2', 'b1\nb2\nb3', 'c1\nc2\nc3\nc4']

  assert.equal(
    projectWordCombinationCount(lists, true, 'progressive').total,
    30n,
  )
  assert.equal(
    projectWordCombinationCount(lists, true, 'adjacent-and-all', [
      true,
      false,
      true,
    ]).total,
    48n,
  )
})

test('generates deterministic subset patterns and individual items first', () => {
  const result = generateWordCombinations({
    lists: ['a1\na2', 'b1', 'c1'],
    pattern: 'progressive',
    includeIndividuals: [false, false, true],
    wordSeparator: ' ',
    caseMode: 'preserve',
    prefix: '',
    suffix: '',
    affixScope: 'combination',
    dedupe: true,
    include: '',
    exclude: '',
  })

  assert.deepEqual(result.rows, [
    'c1',
    'a1 b1',
    'a2 b1',
    'a1 b1 c1',
    'a2 b1 c1',
  ])
  assert.equal(result.projectedCount, '5')
})

test('applies prefix and suffix to each list item or the whole combination', () => {
  const base = {
    lists: ['best seo', 'tools'],
    pattern: 'all-lists' as const,
    includeIndividuals: [],
    wordSeparator: ' ',
    caseMode: 'preserve' as const,
    prefix: '[',
    suffix: ']',
    dedupe: true,
    include: '',
    exclude: '',
  }

  assert.deepEqual(
    generateWordCombinations({ ...base, affixScope: 'item' }).rows,
    ['[best seo] [tools]'],
  )
  assert.deepEqual(
    generateWordCombinations({ ...base, affixScope: 'combination' }).rows,
    ['[best seo tools]'],
  )
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
