import { readFile } from 'node:fs/promises'
import { render } from 'takumi-js'
import { Renderer } from 'takumi-js/node'
import { MARK_SVG, OG_HEIGHT, OG_WIDTH, ogCardHtml } from './card'

const fonts = new URL('../../../public/fonts/', import.meta.url)

// One Takumi renderer with the page fonts loaded once and reused for every
// card. Nothing is fetched over the network.
export async function ogRenderer(site: {
  domain: string
}): Promise<(title: string, path: string) => Promise<Uint8Array>> {
  const renderer = new Renderer()
  await renderer.registerFont({
    name: 'Inter',
    data: await readFile(new URL('InterLatinVF.woff2', fonts)),
  })
  await renderer.registerFont({
    name: 'JetBrains Mono',
    data: await readFile(new URL('JetBrainsMonoLatinVF.woff2', fonts)),
  })
  const images = [{ src: 'mark.svg', data: Buffer.from(MARK_SVG) }]
  return (title, path) =>
    render(ogCardHtml({ title, domain: site.domain, path }), {
      renderer,
      images,
      width: OG_WIDTH,
      height: OG_HEIGHT,
    })
}
