// Synthetic Next.js App Router response modelled on a real streamed article.
// The shell sends a loading skeleton inside a Suspense boundary, then the
// article arrives in hidden segments that inline $RC and $RS scripts move
// into place. Boundary B:0 completes with segment S:3, so tests prove the
// resolver follows the instruction rather than matching id suffixes. The
// placeholder P:4 lives inside S:3 and is filled after S:3 has moved.
// Metadata is either streamed after the body content (the default for
// clients Next.js does not treat as HTML-limited bots) or kept in the head.
// Article blocks are separated by newlines so word expectations depend only
// on which elements are selected, not on text-node spacing.

export const STREAMED_ARTICLE = {
  heading: 'Streaming article fixture',
  firstParagraph:
    'Server streaming sends the page shell first and fills each boundary when its data is ready, so the raw response contains the full article text.',
  secondParagraph:
    'This paragraph arrives in a later segment and replaces a placeholder that was itself inside an earlier streamed segment.',
  relatedCards: ['Related essay about crawl budgets', 'Related essay on logs'],
  skeletonText: 'Loading article skeleton',
  nestedSkeletonText: 'Loading nested placeholder',
  navigationText: 'Home Guides Pricing',
  footerText: 'Footer links privacy terms',
  flightPayloadText: 'flight payload words are not visible',
}

export type StreamedArticleOptions = {
  canonicalUrl: string
  metadata: 'body' | 'head'
  nextPayload?: boolean
}

export function streamedArticleWords(): number {
  return [
    STREAMED_ARTICLE.heading,
    STREAMED_ARTICLE.firstParagraph,
    STREAMED_ARTICLE.secondParagraph,
    ...STREAMED_ARTICLE.relatedCards,
  ]
    .join(' ')
    .split(/\s+/u)
    .filter(Boolean).length
}

export function streamedArticleHtml(options: StreamedArticleOptions): string {
  const article = STREAMED_ARTICLE
  const metadata = `<title>${article.heading}</title><meta name="description" content="A fixture for streamed metadata and content."/><link rel="canonical" href="${options.canonicalUrl}"/>`
  const nextPayload =
    options.nextPayload === false
      ? ''
      : `<script>(self.__next_f=self.__next_f||[]).push([0])</script><script>self.__next_f.push([1,"0:[\\"$\\",\\"p\\",null,{\\"children\\":\\"${article.flightPayloadText}\\"}]"])</script>`
  return `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>${
    options.metadata === 'head' ? metadata : ''
  }<script src="/_next/static/chunks/main.js" async=""></script></head><body><div id="app-shell"><nav><a href="/">Home</a> <a href="/guides">Guides</a> <a href="/pricing">Pricing</a></nav><div id="main-content"><!--$?--><template id="B:0"></template><main class="skeleton"><div aria-hidden="true">${
    article.skeletonText
  }</div><!--$--><p>${article.nestedSkeletonText}</p><!--/$--></main><!--/$--></div><footer>${
    article.footerText
  }</footer></div><script>$RC=function(a,b){};$RS=function(a,b){};</script><div hidden id="S:3"><div class="post"><header><h1>${
    article.heading
  }</h1></header>\n<div class="post-body"><p>${
    article.firstParagraph
  }</p>\n<template id="P:4"></template></div>\n<section id="related">${article.relatedCards
    .map((card) => `<article><a href="/related">${card}</a></article>`)
    .join(
      '\n',
    )}</section></div></div><script>$RC("B:0","S:3")</script><div hidden id="S:4"><p>${
    article.secondParagraph
  }</p>\n</div><script>$RS("S:4","P:4")</script>${nextPayload}${
    options.metadata === 'body' ? metadata : ''
  }</body></html>`
}
