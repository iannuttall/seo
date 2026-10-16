// Shared by the page head (the og:image URL) and the build-time renderer.
// Kept dependency-free so pages never import the Node-only renderer.
export const OG_IMAGE_FORMAT = 'png' as const
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

// The card written beside a prerendered page at build time (og-images.ts):
// `/` -> `/index.png`, `/docs/report` -> `/docs/report/index.png`,
// `/404` -> `/404.png`.
export const ogImageUrl = (canonical: string) => {
  const url = new URL(canonical)
  const pathname = url.pathname.replace(/\/+$/, '')
  const file =
    pathname === '/404'
      ? `${pathname}.${OG_IMAGE_FORMAT}`
      : `${pathname}/index.${OG_IMAGE_FORMAT}`
  return new URL(file, url.origin).toString()
}
