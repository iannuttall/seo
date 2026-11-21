import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterKeywords, keywordClustersCsv } from './keyword-clusters.ts'

// Top-10 page keys for six keywords. "running shoes" shares exactly 4 pages
// with "best running shoes" and "top running shoes" and 5 with "running
// trainers"; the two "best" lists share 6 with each other.
const serps = [
  {
    keyword: 'running shoes',
    pages: [
      'shop.example/running-shoes',
      'brand.example/running',
      'review.example/best-running-shoes',
      'store.example/c/running',
      'wiki.example/running_shoe',
      'mag.example/gear/running-shoes',
      'outlet.example/running',
      'sport.example/shoes/running',
      'blog.example/how-to-choose-running-shoes',
      'news.example/running-shoes',
    ],
  },
  {
    keyword: 'best running shoes',
    pages: [
      'review.example/best-running-shoes',
      'mag.example/gear/running-shoes',
      'sport.example/shoes/running',
      'blog.example/how-to-choose-running-shoes',
      'lab.example/best-running-shoes',
      'runner.example/best',
      'guide.example/top-running-shoes',
      'forum.example/t/best-running-shoes',
      'deals.example/best-running-shoes',
      'list.example/running-shoes-ranked',
    ],
  },
  {
    keyword: 'top running shoes',
    pages: [
      'review.example/best-running-shoes',
      'mag.example/gear/running-shoes',
      'sport.example/shoes/running',
      'blog.example/how-to-choose-running-shoes',
      'lab.example/best-running-shoes',
      'runner.example/best',
      'top.example/running-shoes',
      'video.example/top-running-shoes',
      'pod.example/running',
      'club.example/shoes',
    ],
  },
  {
    keyword: 'running trainers',
    pages: [
      'shop.example/running-shoes',
      'brand.example/running',
      'store.example/c/running',
      'outlet.example/running',
      'sport.example/shoes/running',
      'uk.example/trainers/running',
      'high-street.example/running-trainers',
      'kit.example/trainers',
      'mall.example/running-trainers',
      'local.example/trainers',
    ],
  },
  {
    keyword: 'trail running shoes',
    pages: [
      'shop.example/running-shoes',
      'review.example/best-running-shoes',
      'trail.example/shoes',
      'outdoor.example/trail-running',
      'mountain.example/shoes',
      'hike.example/trail-shoes',
    ],
  },
  {
    keyword: 'marathon training plan',
    pages: [
      'coach.example/marathon-plan',
      'mag.example/training/marathon',
      'app.example/plans/marathon',
    ],
  },
]

test('keyword clustering links keywords that share exactly the threshold', () => {
  const result = clusterKeywords(serps, 4)

  assert.deepEqual(
    result.clusters.map((cluster) => ({
      lead: cluster.lead,
      keywords: cluster.keywords,
    })),
    [
      {
        lead: 'running shoes',
        keywords: [
          { keyword: 'running shoes', sharedWithLead: null },
          { keyword: 'running trainers', sharedWithLead: 5 },
          { keyword: 'best running shoes', sharedWithLead: 4 },
          { keyword: 'top running shoes', sharedWithLead: 4 },
        ],
      },
    ],
  )
  assert.deepEqual(result.unclustered, [
    'marathon training plan',
    'trail running shoes',
  ])
  assert.deepEqual(result.clusters[0]?.sharedPages.slice(0, 2), [
    { page: 'sport.example/shoes/running', keywords: 4 },
    { page: 'blog.example/how-to-choose-running-shoes', keywords: 3 },
  ])
})

test('keyword clustering gives the same clusters in any input order', () => {
  const orders = [
    serps,
    [...serps].reverse(),
    [...serps.slice(3), ...serps.slice(0, 3)],
  ]
  for (const threshold of [4, 5, 6]) {
    const [first, ...rest] = orders.map((order) =>
      clusterKeywords(order, threshold),
    )
    for (const other of rest) assert.deepEqual(other, first)
  }

  // At 5 the head term keeps the trainers, and the two "best" lists pair up.
  assert.deepEqual(
    clusterKeywords([...serps].reverse(), 5).clusters.map((c) => [
      c.lead,
      c.keywords.map((k) => k.keyword),
    ]),
    [
      ['best running shoes', ['best running shoes', 'top running shoes']],
      ['running shoes', ['running shoes', 'running trainers']],
    ],
  )
  // At 6 the two "best" keywords tie; the alphabetical one leads.
  assert.equal(
    clusterKeywords([...serps].reverse(), 6).clusters[0]?.lead,
    'best running shoes',
  )
})

test('keyword clusters CSV lists every keyword with its cluster and lead', () => {
  const csv = keywordClustersCsv(clusterKeywords(serps, 4), [
    { keyword: '=cmd, "quoted"', reason: 'failed' },
  ])
  assert.equal(
    csv,
    [
      'keyword,cluster,lead keyword',
      'running shoes,1,running shoes',
      'running trainers,1,running shoes',
      'best running shoes,1,running shoes',
      'top running shoes,1,running shoes',
      'marathon training plan,unclustered,',
      'trail running shoes,unclustered,',
      `"'=cmd, ""quoted""",failed,`,
      '',
    ].join('\r\n'),
  )
})
