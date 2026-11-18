import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runAiAnswers } from './ai-answers.js'
import type { CommandDeps } from './types.js'

// Paging through answers used to ask every question again and pay again.
// The next page now gets every answer's task, finished ones included, and
// reading tasks back makes no paid request.
test('ai_answers pages by reading every task back, never asking again', async () => {
  const methods: string[] = []
  globalThis.fetch = (async (input: Request) => {
    methods.push(input.method)
    const id = input.url.split('/').pop()
    return Response.json({
      tasks: [
        {
          id,
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          data: { keyword: `question ${id}` },
          result: [
            {
              datetime: '2026-11-05 10:00:00 +00:00',
              markdown: 'See https://example.com/receipts for more.',
              sources: [{ url: 'https://example.org/guide' }],
            },
          ],
        },
      ],
    })
  }) as typeof fetch

  const tasks = [
    'chatgpt:00000000-0000-0000-0000-000000000001',
    'chatgpt:00000000-0000-0000-0000-000000000002',
  ]
  const out = await runAiAnswers(
    {
      site: 'example.com',
      country: 'us',
      detail: 'rows',
      offset: 0,
      tasks,
      waitSeconds: 0,
    },
    new Headers({
      'x-dataforseo-login': 'login',
      'x-dataforseo-password': 'password',
    }),
    {} as CommandDeps,
    () => 'next page',
  )
  const data = out.data as { tasks: string[]; pendingTasks: string[] }
  assert.deepEqual(methods, ['GET', 'GET'])
  assert.deepEqual(data.pendingTasks, [])
  assert.deepEqual([...data.tasks].sort(), tasks)
})

// Answers write placeholder domains into examples. yourdomain.com came 5th
// in citedSites, and a link followed by a backtick counted as its own host.
test('ai_answers never counts placeholder domains as cited sites', async () => {
  globalThis.fetch = (async (input: Request) =>
    Response.json({
      tasks: [
        {
          id: input.url.split('/').pop(),
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          data: { keyword: 'how do I add llms.txt' },
          result: [
            {
              datetime: '2026-11-05 10:00:00 +00:00',
              markdown:
                'Put it at `https://yourdomain.com/llms.txt`, `https://yourdomain/llms.txt` or `https://your-url.com`.',
              sources: [{ url: 'https://www.yourdomain.com/' }],
            },
          ],
        },
      ],
    })) as typeof fetch

  const out = await runAiAnswers(
    {
      site: 'yourdomain.com',
      country: 'us',
      detail: 'rows',
      offset: 0,
      tasks: ['chatgpt:00000000-0000-0000-0000-000000000001'],
      waitSeconds: 0,
    },
    new Headers({
      'x-dataforseo-login': 'login',
      'x-dataforseo-password': 'password',
    }),
    {} as CommandDeps,
    () => 'next page',
  )
  const data = out.data as {
    citedSites: unknown[]
    rows: { result: string; sources: string[] }[]
  }
  assert.deepEqual(data.citedSites, [])
  assert.deepEqual(
    data.rows.map(({ result, sources }) => ({ result, sources })),
    [{ result: 'neither', sources: [] }],
  )
})

// A brand on several domains, named unlike its domain (Claude on claude.ai
// and claude.com, Datadog on datadoghq.com), read as cited 0 and mentioned
// 0. Its other domains now count as citing it, its own names as mentions.
test('ai_answers counts the brand’s other domains and names', async () => {
  const answers: Record<string, object> = {
    '00000000-0000-0000-0000-000000000001': {
      markdown:
        'Try it. ![Logo](https://images.openai.com/static-rsc-4/abc123)',
      sources: [{ url: 'https://www.claude-ai.example/new' }],
    },
    '00000000-0000-0000-0000-000000000002': {
      markdown: 'Claude is a good choice for this.',
      sources: [],
    },
  }
  globalThis.fetch = (async (input: Request) => {
    const id = input.url.split('/').pop() ?? ''
    return Response.json({
      tasks: [
        {
          id,
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          data: { keyword: `question ${id.slice(-1)}` },
          result: [{ datetime: '2026-11-05 10:00:00 +00:00', ...answers[id] }],
        },
      ],
    })
  }) as typeof fetch

  const out = await runAiAnswers(
    {
      site: 'claudehq.example',
      also: ['claude-ai.example'],
      brand: ['Claude'],
      country: 'us',
      detail: 'rows',
      offset: 0,
      tasks: Object.keys(answers).map((id) => `chatgpt:${id}`),
      waitSeconds: 0,
    },
    new Headers({
      'x-dataforseo-login': 'login',
      'x-dataforseo-password': 'password',
    }),
    {} as CommandDeps,
    () => 'next page',
  )
  const data = out.data as {
    domains: string[]
    brandTerms: string[]
    citedSites: unknown[]
    rows: {
      result: string
      cited_url: string | null
      mentioned_as: string | null
      sources: string[]
    }[]
  }
  assert.deepEqual(data.domains, ['claudehq.example', 'claude-ai.example'])
  assert.deepEqual(data.brandTerms, ['claude'])
  assert.deepEqual(data.citedSites, [])
  assert.deepEqual(
    data.rows.map(({ result, cited_url, mentioned_as, sources }) => ({
      result,
      cited_url,
      mentioned_as,
      sources,
    })),
    [
      {
        result: 'cited',
        cited_url: 'https://www.claude-ai.example/new',
        mentioned_as: null,
        sources: [],
      },
      {
        result: 'mentioned',
        cited_url: null,
        mentioned_as: 'claude',
        sources: [],
      },
    ],
  )
})

// ChatGPT's fan-out searches: listed per answer and ranked across answers.
// An answer with no searches says none returned; an engine that never
// reports searches says not available.
test('ai_answers lists the searches ChatGPT ran', async () => {
  const results: Record<string, Record<string, unknown>> = {
    '1': {
      markdown: 'Use a CRM such as Example.',
      sources: [{ url: 'https://example.org/crm' }],
      fan_out_queries: ['best crm small team', 'crm pricing 2026'],
    },
    '2': {
      markdown: 'Import a CSV.',
      sources: [{ url: 'https://example.net/import' }],
      fan_out_queries: ['Best CRM small team', 'import contacts csv'],
    },
    '3': { markdown: 'Jane Austen wrote it.', sources: [] },
    '4': {
      items: [
        { type: 'ai_overview', markdown: 'An overview.', references: [] },
      ],
    },
  }
  globalThis.fetch = (async (input: Request) => {
    const id = input.url.split('/').pop() ?? ''
    const key = id.slice(-1)
    return Response.json({
      tasks: [
        {
          id,
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          data: { keyword: `question ${key}` },
          result: [{ datetime: '2026-11-05 10:00:00 +00:00', ...results[key] }],
        },
      ],
    })
  }) as typeof fetch
  const out = await runAiAnswers(
    {
      site: 'example.com',
      country: 'us',
      detail: 'rows',
      offset: 0,
      tasks: [
        'chatgpt:00000000-0000-0000-0000-000000000001',
        'chatgpt:00000000-0000-0000-0000-000000000002',
        'chatgpt:00000000-0000-0000-0000-000000000003',
        'google_ai_mode:00000000-0000-0000-0000-000000000004',
      ],
      waitSeconds: 0,
    },
    new Headers({
      'x-dataforseo-login': 'login',
      'x-dataforseo-password': 'password',
    }),
    {} as CommandDeps,
    () => 'next page',
  )
  const data = out.data as {
    searches: { query: string; answers: number }[]
    rows: { question: string; searches: string[] | null }[]
  }
  assert.deepEqual(
    data.rows.map((row) => [row.question, row.searches]),
    [
      ['question 1', ['best crm small team', 'crm pricing 2026']],
      ['question 2', ['Best CRM small team', 'import contacts csv']],
      ['question 3', []],
      ['question 4', null],
    ],
  )
  assert.deepEqual(data.searches[0], {
    query: 'best crm small team',
    answers: 2,
  })
  assert.match(out.text, /\(1 returned none/)
  assert.match(out.text, /none returned/)
  assert.match(out.text, /not available/)
})

// Asking the same questions twice in a day paid for three runs to read one
// (Monologue's weekly report). The second call now reads the first run's
// tasks back for free, and refresh still asks again.
test('ai_answers reads back today’s run of the same questions instead of paying again', async () => {
  const posts: string[] = []
  let id = 0
  globalThis.fetch = (async (input: Request) => {
    if (input.method === 'POST') {
      posts.push(input.url)
      const body = (await input.json()) as unknown[]
      return Response.json({
        tasks: body.map(() => ({
          id: `00000000-0000-0000-0000-${String(++id).padStart(12, '0')}`,
          status_code: 20100,
          status_message: 'Task Created.',
          cost: 0.0024,
        })),
      })
    }
    if (input.url.endsWith('/languages') || input.url.endsWith('/locations')) {
      return Response.json({
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                location_code: 2840,
                location_type: 'Country',
                country_iso_code: 'US',
                language_code: 'en',
              },
            ],
          },
        ],
      })
    }
    return Response.json({
      tasks: [
        {
          id: input.url.split('/').pop(),
          status_code: 40602,
          status_message: 'Task In Queue.',
          data: { keyword: 'best crm for a small team' },
        },
      ],
    })
  }) as typeof fetch

  const saved = new Map<string, string>()
  const store = {
    get: async (key: string) => saved.get(key) ?? null,
    put: async (key: string, value: string) => {
      saved.set(key, value)
    },
  }
  const ask = (questions: string[], refresh = false) =>
    runAiAnswers(
      {
        site: 'example.com',
        country: 'us',
        detail: 'full',
        offset: 0,
        questions,
        waitSeconds: 0,
        store,
        refresh,
      },
      new Headers({
        'x-dataforseo-login': 'login',
        'x-dataforseo-password': 'password',
      }),
      {} as CommandDeps,
      () => 'next page',
    )

  const first = await ask([
    'best crm for a small team',
    'how to import contacts',
  ])
  assert.equal(posts.length, 3)
  const firstData = first.data as { pendingTasks: string[]; reused: boolean }
  assert.equal(firstData.pendingTasks.length, 6)
  assert.equal(firstData.reused, false)
  // The free read-back is in the text even with detail full.
  assert.match(first.text, /6 answers aren't ready yet/)

  // Same questions in another order: no new paid task.
  const second = await ask([
    'how to import contacts',
    'best crm for a small team',
  ])
  assert.equal(posts.length, 3)
  const secondData = second.data as {
    pendingTasks: string[]
    reused: boolean
    costUsd: number
  }
  assert.equal(secondData.reused, true)
  assert.equal(secondData.costUsd, 0)
  assert.deepEqual(
    [...secondData.pendingTasks].sort(),
    [...firstData.pendingTasks].sort(),
  )

  // Other questions, or refresh, ask and pay.
  await ask(['best crm for a small team'])
  assert.equal(posts.length, 6)
  await ask(['best crm for a small team', 'how to import contacts'], true)
  assert.equal(posts.length, 9)
})

// Share of voice: the competitors in the site's business context are
// judged on the same answers, by the name beside each domain, so a brand
// whose domain does not spell its name (Wispr Flow on wisprflow.example)
// still counts, and a citation counts once, as cited.
test('ai_answers counts the business context competitors in each answer', async () => {
  const answers: Record<string, { markdown: string; sources: string[] }> = {
    '00000000-0000-0000-0000-000000000001': {
      markdown:
        'Top picks are Wispr Flow and Superwhisper. Wispr Flow is the fastest.',
      sources: ['https://superwhisper.example/pricing'],
    },
    '00000000-0000-0000-0000-000000000002': {
      markdown: 'Most people use Wispr Flow for this.',
      sources: ['https://www.example.org/guide'],
    },
  }
  globalThis.fetch = (async (input: Request) => {
    const id = input.url.split('/').pop() as string
    return Response.json({
      tasks: [
        {
          id,
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          data: { keyword: `question ${id.slice(-1)}` },
          result: [
            {
              datetime: '2026-11-17 10:00:00 +00:00',
              markdown: answers[id]?.markdown,
              sources: answers[id]?.sources.map((url) => ({ url })),
            },
          ],
        },
      ],
    })
  }) as typeof fetch

  const out = await runAiAnswers(
    {
      site: 'example.com',
      country: 'us',
      detail: 'rows',
      offset: 0,
      tasks: Object.keys(answers).map((id) => `chatgpt:${id}`),
      waitSeconds: 0,
      resolveSite: async (target) => `sc-domain:${target}`,
    },
    new Headers({
      'x-dataforseo-login': 'login',
      'x-dataforseo-password': 'password',
    }),
    {
      context: {
        read: async (site: string) =>
          site === 'sc-domain:example.com'
            ? {
                text: '## Competitors\n\n- superwhisper.example (Superwhisper)\n- wisprflow.example Wispr Flow\n',
                updated_at: '2026-11-17',
              }
            : null,
        write: async () => undefined,
      },
    } as unknown as CommandDeps,
    () => 'next page',
  )
  const data = out.data as {
    shareOfVoice: {
      domain: string
      read: number
      cited: number
      mentioned: number
    }[]
  }
  assert.deepEqual(data.shareOfVoice, [
    { domain: 'example.com', read: 2, cited: 0, mentioned: 0 },
    { domain: 'wisprflow.example', read: 2, cited: 0, mentioned: 2 },
    { domain: 'superwhisper.example', read: 2, cited: 1, mentioned: 0 },
  ])
  assert.match(
    out.text,
    /Share of voice, in 2 answers read: example\.com in 0 \(cited 0, named 0\), wisprflow\.example in 2/,
  )
})

// Three runs the same day named the site in different answers. samples
// asks each question n times and reports how often the answers name it.
test('ai_answers with samples asks each question n times and reports a rate', async () => {
  const bodies: unknown[][] = []
  const text: Record<string, string> = {
    '00000000-0000-0000-0000-000000000001': 'Try Notely for this.',
    '00000000-0000-0000-0000-000000000002': 'Most people use Notely.',
    '00000000-0000-0000-0000-000000000003': 'Use a notes app.',
  }
  globalThis.fetch = (async (input: Request) => {
    if (input.method === 'POST') {
      const body = (await input.json()) as unknown[]
      bodies.push(body)
      return Response.json({
        tasks: body.map(() => ({ status_code: 40000, status_message: 'No.' })),
      })
    }
    if (input.url.endsWith('/languages') || input.url.endsWith('/locations')) {
      return Response.json({
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                location_code: 2840,
                location_type: 'Country',
                country_iso_code: 'US',
                language_code: 'en',
              },
            ],
          },
        ],
      })
    }
    const id = input.url.split('/').pop() as string
    return Response.json({
      tasks: [
        {
          id,
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          data: { keyword: 'best notes app' },
          result: [
            { datetime: '2026-11-18 10:00:00 +00:00', markdown: text[id] },
          ],
        },
      ],
    })
  }) as typeof fetch
  const keys = new Headers({
    'x-dataforseo-login': 'login',
    'x-dataforseo-password': 'password',
  })
  const base = {
    site: 'notely.example',
    country: 'us',
    detail: 'rows' as const,
    offset: 0,
    waitSeconds: 0,
    store: null,
  }

  await runAiAnswers(
    { ...base, questions: ['best notes app', 'best todo app'], samples: 3 },
    keys,
    {} as CommandDeps,
    () => '',
  )
  assert.deepEqual(
    bodies.map((body) => body.length),
    [6, 6, 6],
  )

  const out = await runAiAnswers(
    { ...base, tasks: Object.keys(text).map((id) => `chatgpt:${id}`) },
    keys,
    {} as CommandDeps,
    () => '',
  )
  const data = out.data as { rates: unknown[] }
  assert.deepEqual(data.rates, [
    {
      question: 'best notes app',
      engine: 'chatgpt',
      read: 3,
      appeared: 2,
      cited: 0,
    },
  ])
  assert.match(out.text, /cited or named in 2 of 3 answers read \(67%\)/)
})
