import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runResearch } from './research.js'

const dataForSeo = new Headers({
  'x-dataforseo-login': 'login',
  'x-dataforseo-password': 'password',
})

const ok = (result: Record<string, unknown>, cost: number) =>
  Response.json({
    status_code: 20000,
    cost,
    tasks: [
      { status_code: 20000, status_message: 'Ok.', cost, result: [result] },
    ],
  })

// One referring page in DataForSEO's page_intersection shape: the links on
// it, keyed by the number of the target they point to.
const page = (
  url: string,
  title: string,
  rivals: number[],
  extra: Record<string, unknown> = {},
) => ({
  summary: { intersections_count: rivals.length },
  page_intersection: Object.fromEntries(
    rivals.map((n) => [
      String(n),
      [
        {
          domain_from: new URL(url).hostname,
          url_from: url,
          page_from_title: title,
          page_from_language: 'en',
          domain_from_rank: 40,
          anchor: `Rival ${n}`,
          text_pre: 'Our pick for Mac is',
          text_post: 'with local models.',
          dofollow: n === 1,
          ...extra,
        },
      ],
    ]),
  ),
})

test('link_gap pages gives one row per site with its best page, bulk sites after one-off pages, spam left out', async () => {
  const bulk = Array.from({ length: 5 }, (_, i) =>
    page(`https://bulk.example/alt-${i}`, `Rival ${i} alternatives`, [1, 2], {
      domain_from_rank: 90,
    }),
  )
  const items = [
    ...bulk,
    page('https://blog.example/de/beste', 'Beste Diktier-Apps', [1, 2, 3], {
      page_from_language: 'de',
    }),
    page('https://blog.example/best-dictation', 'Best dictation apps', [1, 2]),
    page('https://news.example/story', 'A dictation story', [2, 3], {
      domain_from_rank: 10,
    }),
    page('https://casino.example/x', 'Best casino slots and apps', [1, 2, 3]),
    page('https://rival-a.example/vs', 'Rival A vs Rival B', [2, 3]),
  ]
  let body: Record<string, unknown> = {}
  globalThis.fetch = (async (input: Request) => {
    assert.match(input.url, /backlinks\/page_intersection\/live$/)
    body = ((await input.json()) as Record<string, unknown>[])[0] ?? {}
    return ok({ total_count: 3000, items }, 0.06)
  }) as typeof fetch

  const result = await runResearch(
    {
      action: 'link_gap',
      pages: true,
      target: 'site.example',
      competitors: ['rival-a.example', 'rival-b.example', 'rival-c.example'],
      detail: 'full',
    },
    dataForSeo,
    { call: () => '' },
  )
  assert.deepEqual(body.exclude_targets, ['site.example'])
  const data = result.data as {
    rows: Record<string, unknown>[]
    partial: boolean
    spam: number
    costUsd: number
  }
  // blog.example's German page links three rivals, so it is its best page
  // even though an English one exists; bulk.example's five pages link two.
  assert.deepEqual(
    data.rows.map((row) => [row.site, row.pages, row.rivals_linked]),
    [
      ['blog.example', 2, 3],
      ['news.example', 1, 2],
      ['bulk.example', 5, 2],
    ],
  )
  assert.equal(data.rows[0]?.url, 'https://blog.example/de/beste')
  assert.equal(
    data.rows[1]?.link_text,
    'Our pick for Mac is [Rival 2] with local models.',
  )
  assert.equal(data.rows[1]?.dofollow, false)
  assert.equal(data.spam, 1)
  assert.equal(data.partial, true)
  assert.equal(data.costUsd, 0.06)
})

// One stored AI answer in DataForSEO's LLM mentions shape.
const answer = (question: string, volume: number, urls: string[]) => ({
  question,
  ai_search_volume: volume,
  sources: urls.map((url) => ({
    url,
    domain: new URL(url).hostname,
    title: `Title of ${url}`,
  })),
})

test('ai_answers with competitors ranks the pages buyer answers cite beside them', async () => {
  const answers: Record<string, Record<string, unknown>[]> = {
    'site.example chat_gpt': [
      answer('best dictation app for mac', 50, ['https://list.example/best']),
    ],
    'rival-a.example chat_gpt': [
      answer('best dictation app for mac', 500, [
        'https://list.example/best#:~:text=pick',
        'https://list.example/best?utm_source=chatgpt.com',
        'https://rival-a.example/blog',
        'https://www.youtube.com/watch?v=1',
        'https://support.other.example/help',
      ]),
      answer('how to dictate in word', 9000, ['https://howto.example/word']),
    ],
    'rival-a.example google': [
      answer('rival a alternatives', 300, [
        'https://review.example/alternatives',
        'https://list.example/best',
      ]),
    ],
    'rival-b.example google': [
      answer('top voice typing software', 200, [
        'https://review.example/alternatives',
      ]),
    ],
  }
  globalThis.fetch = (async (input: Request) => {
    assert.match(input.url, /llm_mentions\/search_mentions\/live$/)
    const [task] = (await input.json()) as {
      target: { domain: string }[]
      platform: string
    }[]
    const items = answers[`${task?.target[0]?.domain} ${task?.platform}`] ?? []
    return ok({ total_count: items.length, items }, 0.1)
  }) as typeof fetch

  const result = await runResearch(
    {
      action: 'ai_answers',
      target: 'site.example',
      competitors: ['rival-a.example', 'rival-b.example'],
    },
    dataForSeo,
    { call: () => '' },
  )
  const data = result.data as {
    rows: Record<string, unknown>[]
    buyerAnswers: number
    costUsd: number
  }
  assert.equal(data.buyerAnswers, 3)
  assert.equal(data.costUsd, 0.6)
  // The same page cited three ways in one answer counts once; the rival's
  // own site, YouTube, a help subdomain and the how-to answer are left out.
  assert.deepEqual(
    data.rows.map((row) => [
      row.url,
      row.answers,
      row.ai_search_volume,
      row.rivals,
      row.engines,
      row.cited_with_target,
      row.top_question,
    ]),
    [
      [
        'https://list.example/best',
        2,
        800,
        'rival-a.example',
        'ChatGPT, AI Overviews',
        true,
        'best dictation app for mac',
      ],
      [
        'https://review.example/alternatives',
        2,
        500,
        'rival-a.example rival-b.example',
        'AI Overviews',
        false,
        'rival a alternatives',
      ],
    ],
  )
})
