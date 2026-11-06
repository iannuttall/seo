// The sharing card for every prerendered page, drawn with Takumi at build
// time (see og-images.ts). No external service, cache or purge: each build
// redraws every card from the page's current H1.
import { readFile } from 'node:fs/promises'
import type { FontLoader, RenderInput } from 'takumi-js'

export {
  OG_IMAGE_FORMAT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from './og-image-format'

const publicDir = new URL('../../public/', import.meta.url)

// The same Inter variable font the pages load.
export const ogCardFonts: FontLoader[] = [
  {
    name: 'Inter',
    data: () => readFile(new URL('fonts/InterVF.woff2', publicDir)),
  },
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
// title, which ends with " | SEO Skill" for tabs and search; that part is
// dropped.
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

// The art (a post's cover or its section's art) fills the card, and a soft
// dark fade sits only behind the centred heading, so the title reads on any image
// while the rest of the art keeps its colour and grain. The image is
// registered under OG_COVER_SRC by the caller.
export const OG_COVER_SRC = 'cover'

// `left` centres the heading in the left 55% of the card, for art whose
// subject stands on the right.
export type OgCoverAlign = 'center' | 'left'

export const renderOgCoverCard = (input: {
  title: string
  align?: OgCoverAlign
}): RenderInput => {
  const title = ogCardTitle(input.title)
  const left = input.align === 'left'
  const full = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  }

  return element(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        alignItems: 'center',
        justifyContent: left ? 'flex-start' : 'center',
        paddingLeft: left ? 40 : 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        fontFamily: 'Inter',
      },
    },
    element('img', {
      src: OG_COVER_SRC,
      alt: '',
      style: { ...full, objectFit: 'cover' },
    }),
    element('div', {
      style: {
        ...full,
        backgroundImage: `radial-gradient(ellipse ${left ? '560px' : '680px'} 320px at ${left ? '30%' : '50%'} 50%, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.22) 55%, rgba(0,0,0,0) 100%)`,
      },
    }),
    element(
      'h1',
      {
        style: {
          position: 'relative',
          margin: 0,
          ...(left ? { width: 660 } : {}),
          maxWidth: left ? 660 : 880,
          color: '#ffffff',
          textShadow: '0 1px 3px rgba(0,0,0,0.6), 0 2px 24px rgba(0,0,0,0.65)',
          fontSize: ogTitleSize(title),
          fontWeight: 600,
          lineHeight: 1.08,
          letterSpacing: -2.2,
          textAlign: 'center',
          textWrap: 'balance',
          lineClamp: 3,
        },
      },
      title,
    ),
  ) as unknown as RenderInput
}
