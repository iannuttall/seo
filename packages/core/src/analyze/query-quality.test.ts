import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isLikelyAutomatedQuery,
  isLikelyNavigationalOtherQuery,
  isLowActionabilityQuery,
  QUERY_FLAG_METHOD,
  queryFlags,
} from './query-quality.js'

test('isLowActionabilityQuery keeps normal SEO queries', () => {
  assert.equal(isLowActionabilityQuery('x search'), false)
  assert.equal(isLowActionabilityQuery('origin of the last name laroya'), false)
  assert.equal(isLowActionabilityQuery('high tide today cebu'), false)
  assert.equal(isLowActionabilityQuery('تويتر بحث بدون حساب'), false)
  assert.equal(isLowActionabilityQuery('技术搜索引擎优化'), false)
})

test('isLowActionabilityQuery drops currency and operator dumps', () => {
  assert.equal(isLowActionabilityQuery('7555bdt'), true)
  assert.equal(isLowActionabilityQuery('7555bdt.com'), true)
  assert.equal(isLowActionabilityQuery('site:playbooks.com'), true)
  assert.equal(
    isLowActionabilityQuery('best rss reader -site:reddit.com'),
    true,
  )
  assert.equal(isLowActionabilityQuery('intitle:feedly alternative'), true)
  assert.equal(
    isLowActionabilityQuery(
      'kilo code x_keyword_search tool for advanced search with post content: keywords or exact phrase from: to: since: until: min_faves: filter:media example',
    ),
    true,
  )
  assert.equal(
    isLowActionabilityQuery(
      'cost comparison between free and premium versions of flipboard for desktop users -filetype:txt -filetype:pdf -filetype:epub -site:youtube.com -site:reddit.com -site:amazon.com',
    ),
    true,
  )
})

test('isLowActionabilityQuery drops leaked ranking snippets', () => {
  assert.equal(isLowActionabilityQuery('"ranking/303" "moved up" "$"'), true)
})

test('likely-automated flags identifier dumps and keyword lists only', () => {
  assert.equal(
    isLikelyAutomatedQuery(
      'aieos v1.1 skill.md manifest spec openai anthropic google llama mistral prompt',
    ),
    true,
  )
  assert.equal(
    isLikelyAutomatedQuery(
      'organization_full_name_founded_by_author_allowing_creatives_locality_put_skills',
    ),
    true,
  )
  assert.equal(
    isLikelyAutomatedQuery(
      'how to install python on windows 10 without admin rights',
    ),
    false,
  )
  assert.equal(isLikelyAutomatedQuery('flux image generation api'), false)
  assert.equal(
    isLikelyAutomatedQuery('cómo instalar python en windows sin permisos'),
    false,
  )
})

test('navigational-other flags other sites and keeps own host and topics', () => {
  const context = { siteUrl: 'sc-domain:inference.sh' }
  for (const query of [
    'skills sh',
    'agentskills.io directory',
    'pruna',
    'google gemini 3',
    'replicate login',
  ]) {
    assert.equal(isLikelyNavigationalOtherQuery(query, context), true, query)
  }
  for (const query of [
    'inference sh',
    'inference.sh pricing',
    'docs.inference.sh api',
    'google gemini 3 api',
    'install skill.md file',
    'flux image generation api',
    'transcription',
  ]) {
    assert.equal(isLikelyNavigationalOtherQuery(query, context), false, query)
  }
  assert.deepEqual(queryFlags('skills sh', context), ['navigational-other'])
  assert.deepEqual(queryFlags('flux image api', context), [])
  assert.equal(QUERY_FLAG_METHOD.heuristic, true)
})
