import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type DomainAgeResult, handleDomainAge } from './domain-age.ts'

const bootstrap = {
  services: [
    [['com', 'net'], ['https://rdap.example.net/com/v1/']],
    [['uk'], ['https://rdap.example.org/uk/']],
  ],
}

// Shaped like a registry answer: two registration events (a re-registration
// keeps the earliest), events out of order and a vCard registrar.
const record = {
  objectClassName: 'domain',
  ldhName: 'EXAMPLE.COM',
  status: ['client transfer prohibited', 'active'],
  events: [
    { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' },
    { eventAction: 'registration', eventDate: '2004-02-01T10:00:00Z' },
    { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
    { eventAction: 'last changed', eventDate: '2026-08-14T08:01:43Z' },
    {
      eventAction: 'last update of RDAP database',
      eventDate: '2026-10-21T13:17:05Z',
    },
  ],
  entities: [
    {
      roles: ['registrar'],
      handle: '376',
      vcardArray: [
        'vcard',
        [
          ['version', {}, 'text', '4.0'],
          ['fn', {}, 'text', 'Example Registrar, Inc.'],
        ],
      ],
    },
  ],
  nameservers: [{ ldhName: 'NS1.EXAMPLE.NET' }, { ldhName: 'ns2.example.net' }],
}

function fetcher(registered: Record<string, unknown>) {
  const calls: string[] = []
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url === 'https://data.iana.org/rdap/dns.json')
      return Response.json(bootstrap)
    const name = url.split('/domain/')[1] ?? ''
    return name in registered
      ? Response.json(registered[name])
      : new Response('{}', { status: 404 })
  }
  return { fetch, calls }
}

async function check(domain: string, registered: Record<string, unknown>) {
  const { fetch, calls } = fetcher(registered)
  const response = await handleDomainAge(
    new Request('https://seoskill.dev/api/tools/domain-age', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://seoskill.dev',
      },
      body: JSON.stringify({ domain }),
    }),
    fetch,
  )
  return {
    status: response.status,
    body: (await response.json()) as DomainAgeResult,
    calls,
  }
}

test('reads the earliest registration and the registrar from the registry record', async () => {
  const { body, calls } = await check('https://www.example.com/some/page', {
    'example.com': record,
  })
  assert.equal(body.state, 'found')
  assert.equal(body.domain, 'example.com')
  assert.equal(body.registeredAt, '1995-08-14T04:00:00.000Z')
  assert.equal(body.expiresAt, '2027-08-13T04:00:00.000Z')
  assert.equal(body.updatedAt, '2026-08-14T08:01:43.000Z')
  assert.equal(body.registrar, 'Example Registrar, Inc.')
  assert.deepEqual(body.nameservers, ['ns1.example.net', 'ns2.example.net'])
  assert.deepEqual(calls.slice(1), [
    'https://rdap.example.net/com/v1/domain/example.com',
  ])
})

test('walks up from a subdomain but never reports a registry suffix as the domain', async () => {
  const found = await check('blog.example.co.uk', {
    'example.co.uk': record,
    'co.uk': record,
  })
  assert.equal(found.body.domain, 'example.co.uk')
  const missing = await check('missing.co.uk', { 'co.uk': record })
  assert.equal(missing.body.state, 'not-found')
  assert.equal(missing.body.registeredAt, null)
  assert.ok(!missing.calls.some((url) => url.endsWith('/domain/co.uk')))
})

test('says when a top-level domain has no RDAP server instead of guessing', async () => {
  const { body } = await check('example.de', {})
  assert.equal(body.state, 'no-rdap')
  assert.equal(body.registeredAt, null)
})

test('rejects local and numeric hosts before any request', async () => {
  for (const domain of ['localhost', '192.168.0.1', 'printer.local']) {
    const { status, calls } = await check(domain, {})
    assert.equal(status, 400)
    assert.equal(calls.length, 0)
  }
})
