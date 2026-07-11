import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { CrawlPageSnapshot } from '../monitoring/types.js'

export async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        ;(server as Server).close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

export function crawlPageSnapshot(
  url: string,
  input: Partial<CrawlPageSnapshot> = {},
): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    responseTimeMs: 20,
    title: 'Large site fixture page',
    metaDescription: 'Large site fixture page description.',
    h1: 'Large site fixture page',
    h1Count: 1,
    h2Count: 1,
    h3Count: 0,
    indexable: true,
    wordCount: 180,
    contentHash: `hash-${url}`,
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: true,
      questionHeadings: 1,
      structuredBlocks: 1,
      answerable: true,
    },
    ...input,
  }
}
