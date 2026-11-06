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
