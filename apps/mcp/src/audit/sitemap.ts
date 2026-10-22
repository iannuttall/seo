import { Parser } from 'htmlparser2'

// Streams a sitemap or sitemap index and returns its <loc> values, capped.

export const MAX_SITEMAP_LOCS = 50_000

export async function readSitemap(
  response: Response,
): Promise<{ kind: 'index' | 'urlset'; locs: string[]; capped: boolean }> {
  let kind: 'index' | 'urlset' = 'urlset'
  let inLoc = false
  let loc = ''
  const locs: string[] = []
  let capped = false
  const parser = new Parser(
    {
      onopentag(name) {
        const tag = name.toLowerCase().replace(/^.*:/, '')
        if (tag === 'sitemapindex') kind = 'index'
        if (tag === 'loc') {
          inLoc = true
          loc = ''
        }
      },
      ontext(text) {
        if (inLoc) loc += text
      },
      onclosetag(name) {
        if (name.toLowerCase().replace(/^.*:/, '') !== 'loc') return
        inLoc = false
        if (locs.length < MAX_SITEMAP_LOCS) locs.push(loc.trim())
        else capped = true
      },
    },
    { xmlMode: true, decodeEntities: true },
  )
  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parser.write(decoder.decode(value, { stream: true }))
      if (capped) {
        await reader.cancel()
        break
      }
    }
  }
  parser.end()
  return { kind, locs, capped }
}
