import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IndexMySite } from '../indexing/indexmysite.js'
import { runSubmit, type SubmitAccess } from './submit.js'
import { mcpCall } from './tools.js'
import { type CommandDeps, CommandError } from './types.js'

// seo submit spends the person's Index My Site credits only on confirm,
// quotes the add-on credits, and never charges twice for a retried
// confirm. IndexNow sends nothing until the site serves its key file.

// A made-up IndexNow key, plain enough not to look like a secret.
const TEST_KEY = 'testkey-testkey'

type Sent = { url: string; method: string; headers: Headers; body: string }

function fakeFetch(sent: Sent[], respond: (url: URL) => Response) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    sent.push({
      url: url.toString(),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ''),
    })
    return respond(url)
  }) as typeof fetch
}

const job = {
  id: 'job-1',
  name: '',
  createdAt: 0,
  total: 2,
  counts: { submitted: 2 },
  backgroundPending: 2,
  creditsPerUrl: 2,
  options: { fast: false, bing: true },
  urls: [],
  guidance: { phase: 'running', message: '' },
}

function deps(access: Partial<SubmitAccess>): CommandDeps {
  return {
    call: mcpCall,
    now: () => new Date('2026-11-13T10:00:00Z'),
    submit: {
      indexNowKey: async () => null,
      saveIndexNowKey: async () => undefined,
      indexMySite: async () => null,
      connectIndexMySite: async () => '',
      indexMySiteConnect: 'Connect it.',
      ...access,
    },
  } as unknown as CommandDeps
}

test('Index My Site quotes Bing at 2 credits a URL and sends only on confirm, once per retry', async () => {
  const sent: Sent[] = []
  const ims = new IndexMySite(
    async () => 'token',
    fakeFetch(sent, (url) =>
      url.pathname === '/api/credits'
        ? Response.json({ balance: 3, autoReloadEnabled: false })
        : Response.json({ job }, { status: 201 }),
    ),
  )
  const run = (confirm: boolean) =>
    runSubmit(
      {
        action: 'indexmysite',
        urls: ['https://example.com/a', 'https://example.com/b#top'],
        bing: true,
        confirm,
      },
      deps({ indexMySite: async () => ims }),
    )

  const quote = await run(false)
  assert.equal(
    sent.filter((item) => item.method === 'POST').length,
    0,
    'a quote sends nothing',
  )
  assert.deepEqual(quote.data, {
    action: 'indexmysite',
    sent: false,
    urls: 2,
    creditsPerUrl: 2,
    mostCredits: 4,
    balance: 3,
    options: { fast: false, bing: true },
  })
  assert.match(quote.text, /Only the Google credit comes back/)

  await run(true)
  await run(true)
  const posts = sent.filter((item) => item.method === 'POST')
  assert.equal(posts.length, 2)
  const [first, second] = posts
  assert.ok(first && second)
  assert.equal(new URL(first.url).pathname, '/api/indexing/jobs')
  assert.equal(first.headers.get('authorization'), 'Bearer token')
  const key = first.headers.get('idempotency-key')
  assert.ok(key)
  assert.equal(second.headers.get('idempotency-key'), key)
  assert.deepEqual(JSON.parse(first.body), {
    urls: ['https://example.com/a', 'https://example.com/b'],
    bing: true,
    source: 'seo-skill',
  })
})

test('IndexNow sends nothing while the key file is not live', async () => {
  const sent: Sent[] = []
  const fetcher = fakeFetch(
    sent,
    () => new Response('Not found', { status: 404 }),
  )
  await assert.rejects(
    runSubmit(
      { action: 'indexnow', urls: ['https://example.com/a'] },
      deps({ indexNowKey: async () => TEST_KEY, fetch: fetcher }),
    ),
    (error: unknown) =>
      error instanceof CommandError && /Nothing was sent/.test(error.message),
  )
  assert.deepEqual(
    sent.map((item) => item.url),
    ['https://example.com/testkey-testkey.txt'],
  )
})

test('a key file fetch that fails names the reason, not only "fetch failed"', async () => {
  const fetcher = (async () => {
    throw new TypeError('fetch failed', {
      cause: Object.assign(
        new Error('self-signed certificate in certificate chain'),
        {
          code: 'SELF_SIGNED_CERT_IN_CHAIN',
        },
      ),
    })
  }) as typeof fetch
  const result = await runSubmit(
    { action: 'indexnow_key', site: 'example.com', key: TEST_KEY },
    deps({ fetch: fetcher }),
  )
  const data = result.data as { live: boolean; problem: string }
  assert.equal(data.live, false)
  assert.match(data.problem, /SELF_SIGNED_CERT_IN_CHAIN/)
  assert.match(data.problem, /NODE_USE_SYSTEM_CA/)
})
