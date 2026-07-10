export const CRAWL_CANCELLED = Symbol('crawl-cancelled')

export function abortController(input: {
  timeoutMs: number
  signal?: AbortSignal
}): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, Math.min(input.timeoutMs, 5_000))
  if (input.signal?.aborted) {
    controller.abort()
  } else {
    input.signal?.addEventListener('abort', abort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', abort)
    },
  }
}

export function cancellationRace(
  signal: AbortSignal,
): Promise<typeof CRAWL_CANCELLED> {
  if (signal.aborted) return Promise.resolve(CRAWL_CANCELLED)
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(CRAWL_CANCELLED), {
      once: true,
    })
  })
}
