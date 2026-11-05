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
