import { SeoError } from '../errors.js'

// Reads a JSON response body. Some proxies, VPNs and security tools pass a
// gzip body through without its content-encoding header, so fetch does not
// unzip it and JSON parsing fails on the gzip bytes (issue #70). This unzips
// such a body, and names the endpoint when the body still is not JSON.
// Works in Node and in Workers.

const GZIP = [0x1f, 0x8b]

async function gunzip(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(bytes).body?.pipeThrough(
    new DecompressionStream('gzip'),
  )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readBytes(
  response: Response,
  label: string,
  maxBytes: number | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!maxBytes || !response.body) {
    return new Uint8Array(await response.arrayBuffer())
  }
  const tooLarge = () =>
    new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${label} returned more than ${maxBytes} bytes, so it was not read.`,
    )
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    await response.body.cancel()
    throw tooLarge()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

export async function readJson<T = unknown>(
  response: Response,
  label: string,
  options: { maxBytes?: number } = {},
): Promise<T> {
  let bytes = await readBytes(response, label, options.maxBytes)
  if (bytes[0] === GZIP[0] && bytes[1] === GZIP[1]) {
    try {
      bytes = await gunzip(bytes)
    } catch {
      // Not real gzip; fall through to the clear error below.
    }
  }
  const text = new TextDecoder().decode(bytes)
  try {
    return JSON.parse(text) as T
  } catch {
    const start = [...bytes.slice(0, 4)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${label} returned a response that is not JSON (HTTP ${response.status}, ${response.headers.get('content-type') ?? 'no content type'}, first bytes ${start || 'none'}). A proxy, VPN or security tool may be changing HTTPS traffic. Try again on another network.`,
    )
  }
}

// The same, for error bodies that may be empty or not JSON.
export async function readJsonOrUndefined<T = unknown>(
  response: Response,
  label: string,
): Promise<T | undefined> {
  return readJson<T>(response, label).catch(() => undefined)
}
