import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aiQueryKind, aiQueryNoise, askable } from './ai-queries.js'

// Junk that matched the AI query patterns and was sent to paid AI answer
// checks: split letters, broken encoding and pasted tool or agent text.
test('ai-queries leaves out junk and asks only standalone questions', () => {
  const junk: [string, string][] = [
    ['s e a r c h k e y w o r d r e p o r t', 'spaced_letters'],
    ['s a v e d k e y w o r d s 2 0 2 5 - 0 6 - 1 7', 'spaced_letters'],
    [
      'яю keyword serp features volume kd cpc organic traffic',
      'broken_encoding',
    ],
    ['view site â» seo report â» ppc rank: 440', 'broken_encoding'],
    [
      'p begin tracking the progress of your domain&#39 s keywords',
      'broken_encoding',
    ],
    [
      'p start tracking the keyword progress of your domain with a tool',
      'pasted_text',
    ],
    [
      'here are all the keywords, one per line ready to copy and paste',
      'pasted_text',
    ],
    [
      'done you can copy this and save it as keywords.txt for any tool',
      'pasted_text',
    ],
    [
      'current state: your rank tracker project has 0 keywords tracked',
      'pasted_text',
    ],
  ]
  for (const [query, reason] of junk) {
    assert.equal(aiQueryNoise(query), reason, query)
  }

  const real = [
    'how do i check my spam score on a website?',
    'what is an seo agent and how does it actually work?',
    'i need a core web vitals audit. which agency should i hire?',
    'done for you seo services for a small local bakery near me please',
    'c programming tutorial for seo people who want to learn it fast',
  ]
  for (const query of real) assert.equal(aiQueryNoise(query), null, query)
  for (const query of real.slice(0, 3)) {
    assert.equal(askable(query, aiQueryKind(query) ?? undefined), true, query)
  }

  // Statements and pasted field lists match "long" but are not questions.
  for (const query of [
    'keyword research project data model seed keywords market target country search volume',
    'the domain you are trying to run the report on has less than 5 keywords.',
    'site:example.com "keyword" "volume"',
    'how to set up automated rank tracking reports?. my location is germany.',
  ]) {
    assert.equal(askable(query, aiQueryKind(query) ?? undefined), false, query)
  }
})
