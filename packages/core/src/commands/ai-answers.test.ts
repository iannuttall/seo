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
