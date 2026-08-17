import type { publicHttpFetch } from '../../fetch/http-client.js'

export const AGENT_DISCOVERY_MAX_BODY_BYTES = 2_000_000

class ResponseBodyLimitError extends Error {
  readonly bytesRead: number
  readonly limitBytes: number

  constructor(bytesRead: number, limitBytes: number) {
    super(`Response exceeds ${limitBytes} bytes.`)
    this.name = 'ResponseBodyLimitError'
    this.bytesRead = bytesRead
    this.limitBytes = limitBytes
  }
}

export function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined
  const target = name.toLowerCase()
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === target,
  )?.[1]
}

export function linkEntries(value: string | undefined, base: string) {
  if (!value) return []
  return value
    .split(/,(?=\s*<)/u)
    .map((entry) => {
      const match = entry.match(/^\s*<([^>]+)>\s*(.*)$/u)
      if (!match?.[1]) return undefined
      try {
        const url = new URL(match[1], base).toString()
        const parameters = match[2] ?? ''
        const rel = parameters.match(/(?:^|;)\s*rel=(?:"([^"]+)"|([^;\s]+))/iu)
        const type = parameters.match(
          /(?:^|;)\s*type=(?:"([^"]+)"|([^;\s]+))/iu,
        )
        return {
          url,
          rel: (rel?.[1] ?? rel?.[2] ?? '').toLowerCase().split(/\s+/u),
          type: (type?.[1] ?? type?.[2] ?? '').toLowerCase(),
        }
      } catch {
        return undefined
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

export function normalizedDocumentUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/u, '')
  return url.toString()
}

export function combinedSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, timeoutMs)
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    },
  }
}

export async function readBoundedText(
  response: Awaited<ReturnType<typeof publicHttpFetch>>,
  maxBytes = AGENT_DISCOVERY_MAX_BODY_BYTES,
): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > maxBytes) {
        throw new ResponseBodyLimitError(size, maxBytes)
      }
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchText(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
  redirect?: 'follow' | 'manual'
  accept?: string
  maxBytes?: number
  returnOnBodyLimit?: boolean
}) {
  const controller = combinedSignal(input.timeoutMs, input.signal)
  try {
    const response = await input.fetch(input.url, {
      profile: 'bot',
      redirect: input.redirect ?? 'follow',
      headers: input.accept ? { accept: input.accept } : undefined,
      signal: controller.signal,
    })
    try {
      const body = await readBoundedText(response, input.maxBytes)
      return {
        response,
        body,
        bodyLimitExceeded: false,
        bodyLimitBytes: input.maxBytes ?? AGENT_DISCOVERY_MAX_BODY_BYTES,
        bytesRead: Buffer.byteLength(body),
      }
    } catch (error) {
      if (input.returnOnBodyLimit && error instanceof ResponseBodyLimitError) {
        return {
          response,
          body: '',
          bodyLimitExceeded: true,
          bodyLimitBytes: error.limitBytes,
          bytesRead: error.bytesRead,
        }
      }
      throw error
    }
  } finally {
    controller.cleanup()
  }
}

export function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
