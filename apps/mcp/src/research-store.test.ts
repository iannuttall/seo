import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { type CommandDeps, runAiAnswers } from '@seo/core/commands'
import { researchStore } from './research-store.ts'

// D1 on SQLite, with the research_cache migration applied.
function database() {
  const db = new DatabaseSync(':memory:')
  db.exec(
    readFileSync(
      new URL('../migrations/0024_research_cache.sql', import.meta.url),
      'utf8',
    ),
  )
  return {
    prepare: (sql: string) => ({
      bind: (...args: (string | number)[]) => ({
        first: async () => db.prepare(sql).get(...args) ?? null,
        run: async () => db.prepare(sql).run(...args),
      }),
    }),
  } as unknown as D1Database
}

// The Youform teardown (2026-11-19): a second hosted ai_answers call for the
// same questions, 12 minutes later, asked and paid again because the
// Workers cache that held the run is local to one data centre. Each call
// here gets its own store, as calls landing in different places do.
test('ai_answers on the hosted server reads back today’s run from another call instead of paying again', async () => {
  const posts: string[] = []
  let id = 0
  const realFetch = globalThis.fetch
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
          data: { keyword: 'best form builder' },
        },
      ],
    })
  }) as typeof fetch

  const env = { DB: database() }
  const ask = (detail: 'summary' | 'rows', offset: number) =>
    runAiAnswers(
      {
        site: 'example.com',
        country: 'us',
        detail,
        offset,
        questions: ['best form builder', 'free typeform alternative'],
        brand: ['Example'],
        waitSeconds: 0,
        store: researchStore(env),
      },
      new Headers({
        'x-dataforseo-login': 'login',
        'x-dataforseo-password': 'password',
      }),
      {} as CommandDeps,
      () => 'next page',
    )

  try {
    const first = (await ask('summary', 0)).data as {
      costUsd: number
      reused: boolean
    }
    const paid = posts.length
    assert.ok(paid > 0)
    assert.ok(first.costUsd > 0)
    assert.equal(first.reused, false)

    const second = (await ask('rows', 4)).data as {
      costUsd: number
      reused: boolean
    }
    assert.equal(posts.length, paid, 'the second call asked again')
    assert.equal(second.costUsd, 0)
    assert.equal(second.reused, true)
  } finally {
    globalThis.fetch = realFetch
  }
})
