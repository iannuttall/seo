import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aiQueriesReport,
  aiQueryKind,
  aiQueryNoise,
  askable,
} from './ai-queries.js'

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

// Follow-ups with a pronoun and nothing named, joined by page and day. The
// site's own name, the "it" of time and distance, and "this week" are not
// follow-ups.
test('ai-queries finds pronoun follow-ups and joins them into trails', async () => {
  const row = (keys: string[], impressions: number, clicks = 0) => ({
    keys,
    clicks,
    impressions,
    ctr: clicks / impressions,
    position: 3,
  })
  for (const [query, kind] of [
    ['how much is it', 'pronoun'],
    ['do they ship to canada', 'pronoun'],
    ['is it rare', 'pronoun'],
    ['was it a full moon last night', null],
    ['how far is it to the moon', null],
    ['how long does it take to get to mars', null],
    ['is it safe to swim in the sea', null],
    ['what moon is it', null],
    ['was it a full moon', null],
    ['is it a common name', 'pronoun'],
    ['what happened this week', null],
  ] as const) {
    assert.equal(aiQueryKind(query) === 'pronoun', kind === 'pronoun', query)
  }
  assert.equal(aiQueryKind('do they ship examplestore', ['examplestore']), null)

  const page = 'https://example.com/widgets/'
  const other = 'https://example.com/about/'
  const daily = [
    row(['2026-10-01', 'how much is it', page], 4),
    row(['2026-10-01', 'do they ship to canada', page], 2),
    row(['2026-10-01', 'how much does it cost', page], 1),
    // The site's own name: not a follow-up, so no trail on the 2nd.
    row(['2026-10-02', 'how much is it', page], 3),
    row(['2026-10-02', 'does examplestore ship it', page], 3),
    // One follow-up on another page that day: not a trail.
    row(['2026-10-01', 'yes', other], 5),
  ]
  // The site is the navigational answer for its own name.
  const named = [
    { ...row(['examplestore'], 200, 120), position: 1 },
    { ...row(['example store'], 50, 20), position: 1.2 },
  ]
  const report = await aiQueriesReport(
    {
      site: 'sc-domain:examplestore.com',
      startDate: '2026-08-01',
      endDate: '2026-10-28',
    },
    async (_site, body) => {
      const dims = body.dimensions ?? []
      const rows =
        dims[0] === 'date'
          ? daily
          : dims.length === 0
            ? [row([], 1000, 10)]
            : dims.length === 1
              ? named
              : daily.map((r) => row(r.keys.slice(1), r.impressions))
      return { rows, calls: 1, rowsFetched: rows.length }
    },
  )
  const followUps = report.followUps as {
    range: { startDate: string }
    trailCount: number
    trails: { date: string; page: string; turns: number; queries: string[] }[]
    brandTerms: string[]
  }
  assert.equal(followUps.range.startDate, '2026-10-01')
  assert.ok(followUps.brandTerms.includes('examplestore'))
  assert.equal(followUps.trailCount, 1)
  assert.deepEqual(followUps.trails[0], {
    date: '2026-10-01',
    page,
    turns: 3,
    impressions: 7,
    queries: [
      'how much is it',
      'do they ship to canada',
      'how much does it cost',
    ],
  })
})
