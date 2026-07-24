import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDomainRatingHandler,
  domainRatingInputSchema,
} from './domain-rating.js'

test('Domain Rating report forwards one provider-neutral bounded request', async () => {
  const handler = createDomainRatingHandler({
    domainRatingReport: async (input) => {
      assert.deepEqual(input, {
        target: 'example.com',
        targetMode: 'domain',
        provider: 'ahrefs',
        refresh: true,
      })
      return {
        summary: { verdict: 'Domain Rating evidence retained.' },
      } as never
    },
  })

  const result = await handler({
    target: 'example.com',
    targetMode: 'domain',
    provider: 'ahrefs',
    refresh: true,
  })
  assert.equal(result.isError, undefined)
  assert.equal(
    result.structuredContent?.summary &&
      (result.structuredContent.summary as Record<string, unknown>).verdict,
    'Domain Rating evidence retained.',
  )
})

test('Domain Rating schema accepts domain and URL targets only for research providers', () => {
  for (const input of [
    { target: 'example.com' },
    {
      target: 'https://example.com/page',
      targetMode: 'url',
      provider: 'ahrefs',
    },
  ]) {
    assert.equal(
      domainRatingInputSchema.safeParse(input).success,
      true,
      JSON.stringify(input),
    )
  }
  for (const input of [
    { target: '' },
    { target: 'example.com', targetMode: 'prefix' },
    { target: 'example.com', provider: 'bing' },
    { target: 'example.com', unexpected: true },
  ]) {
    assert.equal(
      domainRatingInputSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})
