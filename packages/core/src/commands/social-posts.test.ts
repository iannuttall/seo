import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SocialPostsData } from './social-posts.js'
import { runSocialPosts } from './social-posts.js'

// FxTwitter v2 payloads in the shape api.fxtwitter.com returned them, cut
// down to the fields that matter and moved to example accounts.
const author = (screen_name: string) => ({
  type: 'profile',
  id: '100',
  name: screen_name === 'example' ? 'Example Founder' : 'Someone Else',
  screen_name,
  url: `https://x.com/${screen_name}`,
  followers: 12345,
  protected: false,
})

const status = (
  id: string,
  by: string,
  numbers: { views: number | null; likes: number; bookmarks: number },
  extra: Record<string, unknown> = {},
) => ({
  type: 'status',
  url: `https://x.com/${by}/status/${id}`,
  id,
  text: `Post ${id} by ${by}`,
  raw_text: { text: `Post ${id}`, display_text_range: [0, 10], facets: [] },
  created_at: 'Fri Oct 30 12:08:31 +0000 2026',
  created_timestamp: 1793362111,
  likes: numbers.likes,
  reposts: 6,
  quotes: 3,
  replies: 114,
  bookmarks: numbers.bookmarks,
  views: numbers.views,
  lang: 'en',
  replying_to: null,
  reposted_by: null,
  author: author(by),
  provider: 'twitter',
  ...extra,
})

const page = [
  // A repost of another account.
  status(
    '2117648569498788094',
    'someone',
    { views: 517312, likes: 21303, bookmarks: 1430 },
    {
      reposted_by: {
        id: '100',
        name: 'Example Founder',
        screen_name: 'example',
        url: 'https://x.com/example',
      },
    },
  ),
  status(
    '2116140189181702452',
    'example',
    { views: 39704, likes: 199, bookmarks: 182 },
    {
      text: `which tools are worth it?\n\n${'long line '.repeat(30)}`,
      raw_text: {
        text: 'which tools are worth it? https://t.co/a https://t.co/b',
        facets: [
          {
            type: 'url',
            indices: [26, 49],
            original: 'https://t.co/a',
            replacement: 'https://www.example.com/p/tools',
          },
          {
            type: 'url',
            indices: [50, 73],
            original: 'https://t.co/b',
            replacement: 'https://x.com/someone/status/2115934579446182213',
          },
        ],
      },
    },
  ),
  // A reply in its own thread.
  status(
    '2116141365977325575',
    'example',
    { views: 5084, likes: 16, bookmarks: 3 },
    {
      replying_to: {
        screen_name: 'example',
        status: '2116140189181702452',
      },
    },
  ),
  // Same views as the next post, more bookmarks.
  status(
    '2115831108507955439',
    'example',
    { views: 6535, likes: 38, bookmarks: 27 },
    {
      quote: status('2115363203127374211', 'example', {
        views: 1,
        likes: 1,
        bookmarks: 1,
      }),
    },
  ),
  status('2115114370489635118', 'example', {
    views: 6535,
    likes: 27,
    bookmarks: 14,
  }),
  status('2114821123984765199', 'example', {
    views: null,
    likes: 30,
    bookmarks: 0,
  }),
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

test('lists own posts by views, retries a flaky timeline and reports each lookup', async () => {
  const requested: string[] = []
  let timelineCalls = 0
  const fx = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    requested.push(url.pathname + url.search)
    assert.ok(new Headers(init?.headers).get('user-agent'))
    if (url.pathname === '/2/profile/example/statuses') {
      timelineCalls += 1
      // FxTwitter answers 404 for a real timeline now and then.
      if (timelineCalls === 1)
        return json(
          { code: 404, results: [], cursor: { top: null, bottom: null } },
          404,
        )
      // The cursor page repeats the first page.
      return json({
        code: 200,
        results: page,
        cursor: { top: 'top', bottom: 'next' },
      })
    }
    const id = url.pathname.split('/').at(-1)
    if (id === '1990000000000000001')
      return json({
        code: 200,
        status: status(id, 'example', {
          views: 902311,
          likes: 4100,
          bookmarks: 2900,
        }),
        thread: null,
        author: author('example'),
      })
    if (id === '1990000000000000002')
      return json({
        code: 200,
        status: status(id, 'someone', { views: 10, likes: 1, bookmarks: 0 }),
        thread: null,
        author: author('someone'),
      })
    return json({ status: null, thread: null, author: null, code: 404 }, 404)
  }) as typeof fetch

  const result = await runSocialPosts(
    {
      handle: '@example',
      posts: [
        'https://x.com/example/status/1990000000000000001?s=20',
        '1990000000000000002',
        'https://twitter.com/example/status/1990000000000000003',
        // Already on the timeline, so not requested again.
        '2116140189181702452',
      ],
    },
    fx,
  )
  const data = result.data as SocialPostsData

  assert.equal(data.account.state, 'found')
  assert.equal(data.account.name, 'Example Founder')
  assert.equal(data.timeline.requests, 3)
  assert.equal(data.timeline.pages, 2)
  assert.equal(data.timeline.posts, 4)
  assert.equal(data.timeline.skippedReposts, 1)
  assert.equal(data.timeline.skippedReplies, 1)
  assert.deepEqual(
    data.posts.map((post) => [post.id, post.views, post.source]),
    [
      ['1990000000000000001', 902311, 'lookup'],
      ['2116140189181702452', 39704, 'timeline'],
      ['2115831108507955439', 6535, 'timeline'],
      ['2115114370489635118', 6535, 'timeline'],
      ['2114821123984765199', null, 'timeline'],
    ],
  )
  const top = data.posts[1]
  assert.deepEqual(top?.links, ['https://www.example.com/p/tools'])
  assert.equal(top?.linksOut, true)
  assert.equal([...(top?.text ?? '')].length, 201)
  assert.equal(data.posts[2]?.quote, true)
  assert.equal(data.posts[0]?.date, '2026-10-30T12:08:31.000Z')

  assert.equal(data.lookups.requested, 4)
  assert.equal(data.lookups.found, 2)
  assert.deepEqual(data.lookups.otherAuthor, [
    { id: '1990000000000000002', author: 'someone' },
  ])
  assert.deepEqual(data.lookups.failed, [
    { id: '1990000000000000003', reason: 'not_found', status: 404 },
  ])
  assert.ok(!requested.some((path) => path.endsWith('/2116140189181702452')))
  // No profile request: the posts show the account exists.
  assert.ok(!requested.includes('/2/profile/example'))
})

test('a suspended account is not reported as an empty timeline', async () => {
  const fx = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/2/profile/example')
      return json(
        { code: 404, reason: 'suspended', message: 'User is suspended' },
        404,
      )
    return json(
      { code: 404, results: [], cursor: { top: null, bottom: null } },
      404,
    )
  }) as typeof fetch
  const data = (await runSocialPosts({ handle: 'example' }, fx))
    .data as SocialPostsData
  assert.equal(data.account.state, 'suspended')
  assert.equal(data.timeline.state, 'unavailable')
  assert.equal(data.timeline.requests, 6)
  assert.deepEqual(data.posts, [])
})
