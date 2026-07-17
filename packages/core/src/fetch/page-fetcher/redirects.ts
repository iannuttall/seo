import type { PageFetchResult } from '../../types.js'
import { publicHttpFetch } from '../http-client.js'

type RedirectHop = NonNullable<
  PageFetchResult['diagnostics']['redirectChain']
>[number]

export async function fetchWithRedirectChain(
  url: string,
  signal: AbortSignal,
): Promise<{
  response: Awaited<ReturnType<typeof publicHttpFetch>>
  redirectChain: RedirectHop[]
}> {
  const redirectChain: RedirectHop[] = []
  let currentUrl = url

  for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
    const response = await publicHttpFetch(currentUrl, {
      redirect: 'manual',
      signal,
    })
    const location = response.headers.get('location')

    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, redirectChain }
    }

    const nextUrl = new URL(location, currentUrl).toString()
    redirectChain.push({
      url: currentUrl,
      status: response.status,
      location: nextUrl,
    })
    await response.body?.cancel().catch(() => undefined)
    currentUrl = nextUrl
  }

  throw new Error(`Too many redirects for ${url}`)
}
