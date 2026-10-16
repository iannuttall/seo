// The sharing card for every prerendered page, drawn with Takumi at build
// time (see og-images.ts). No external service, cache or purge: each build
// redraws every card from the page's current H1.
import { readFile } from 'node:fs/promises'
import type { FontLoader, ImagesInput, RenderInput } from 'takumi-js'

export {
  OG_IMAGE_FORMAT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from './og-image-format'

const publicDir = new URL('../../public/', import.meta.url)

// The site's light theme (globals.css), in hex for the renderer.
const colors = {
  surface: '#fafafa',
  text: '#171717',
  faint: '#808080',
  primary: '#0092b8',
}

// The SEO Skill mark, the same paths as public/favicon.svg.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="116 70 730 694" fill="${colors.text}"><path d="M350.963 300 L569.873 300 L569.873 301.646 L607.572 301.646 A223.005 222.797 0 0 1 830.577 524.443 A223.005 223.562 0 0 1 607.572 748.005 L432.5 748.005 C419.146 748.005 402.821 730.609 402.821 716.5 L402.821 525.14 L350.963 525.14 Z"/><path d="M351.663 78.757 L540 78.757 C554.614 78.757 570.373 95.892 570.373 110.5 L570.373 301.599 L351.663 301.599 L351.663 524.54 A222.919 222.919 0 0 1 128.744 301.621 A222.919 222.864 0 0 1 351.663 78.757 Z"/><path d="M615.373 78.657 L814.008 78.657 C833.382 78.657 845.678 101.744 837.508 115.896 L737.067 289.633 C727.659 305.929 702.019 306.871 691.587 288.802 L591.873 115.896 C583.703 101.744 595.999 78.657 615.373 78.657 Z"/><path d="M353.141 748.251 L154.906 748.251 C135.532 748.251 123.236 725.164 131.406 711.012 L225.797 545.373 C240.447 519.998 264.091 515.719 280.567 544.257 L376.641 711.012 C384.812 725.164 372.515 748.251 353.141 748.251 Z"/></svg>`

// The same Inter and JetBrains Mono variable fonts the pages load.
export const ogCardFonts: FontLoader[] = [
  {
    name: 'Inter',
    data: () => readFile(new URL('fonts/InterVF.woff2', publicDir)),
  },
  {
    name: 'JetBrains Mono',
    data: () => readFile(new URL('fonts/JetBrainsMonoVF.woff2', publicDir)),
  },
]

export const ogCardImages: ImagesInput = [
  { src: 'seo-mark.svg', data: () => Buffer.from(LOGO_SVG) },
]

type Style = Record<string, string | number>
type Child = CardNode | string | null
type CardNode = { type: string; props: Record<string, unknown> }

/** A Takumi node: the same { type, props } shape as a React element. */
const element = (
  type: string,
  props: Record<string, unknown> & { style?: Style },
  ...children: Child[]
): CardNode => ({
  type,
  props: {
    ...props,
    ...(children.length === 1
      ? { children: children[0] }
      : children.length > 1
        ? { children }
        : {}),
  },
})

// The card shows the page's H1. Pages without one fall back to the SEO
// title, which ends with " | SEO Skill" for tabs and search; the card
// already shows the mark and hostname, so that part is dropped.
export const ogCardTitle = (title: string) =>
  title
    .replace(/\s*[|\u2013\u2014-]\s*SEO Skill$/i, '')
    .replace(/^SEO Skill\s*[|\u2013\u2014-]\s*/i, '')
    .trim() || 'SEO Skill'

// Longer headings step down so three lines always fit.
export const ogTitleSize = (title: string) => {
  if (title.length > 60) return 60
  if (title.length > 36) return 70
  return 80
}

// The footer names the page's own URL. Astro's build pathnames have no
// leading slash ("docs/report"), so the path is normalized first, and long
// paths are cut to one line.
export const ogCardPath = (pathname: string) => {
  const trimmed = pathname.replace(/^\/+|\/+$/gu, '')
  if (!trimmed) return ''
  const path = `/${trimmed}`
  return path.length > 48 ? `${path.slice(0, 47)}…` : path
}

export const renderOgCard = (input: {
  title: string
  pathname?: string
}): RenderInput => {
  const title = ogCardTitle(input.title)

  return element(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 72,
        backgroundColor: colors.surface,
        color: colors.text,
        fontFamily: 'Inter',
      },
    },
    element('img', { src: 'seo-mark.svg', width: 64, height: 61, alt: '' }),
    element(
      'h1',
      {
        style: {
          margin: 0,
          maxWidth: 1000,
          fontSize: ogTitleSize(title),
          fontWeight: 600,
          lineHeight: 1.08,
          letterSpacing: -2.4,
          textWrap: 'balance',
          lineClamp: 3,
        },
      },
      title,
    ),
    element(
      'div',
      {
        style: {
          display: 'flex',
          fontFamily: 'JetBrains Mono',
          fontSize: 26,
          color: colors.faint,
        },
      },
      element(
        'span',
        { style: { color: colors.primary, fontWeight: 700 } },
        'seoskill.dev',
      ),
      ogCardPath(input.pathname ?? ''),
    ),
  ) as unknown as RenderInput
}
