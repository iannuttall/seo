export type FaviconImage = {
  format: 'png' | 'gif' | 'jpeg' | 'webp' | 'avif' | 'ico' | 'svg' | 'unknown'
  width?: number
  height?: number
  square?: boolean
  scalable?: boolean
  embeddedSizes?: string[]
}

export function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>()
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu
  const name = pattern.exec(tag)
  if (!name) return attributes
  for (const match of tag.matchAll(pattern)) {
    if (match.index === name.index) continue
    attributes.set(
      (match[1] ?? '').toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? '',
    )
  }
  return attributes
}

function uint16Big(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0)
}

function uint32Big(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  )
}

function uint16Little(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + (bytes[offset + 1] ?? 0) * 256
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end))
}

function jpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1] ?? 0
    if (marker === 0xda || marker === 0xd9) break
    const length = uint16Big(bytes, offset + 2)
    if (length < 2) break
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker) &&
      offset + 8 < bytes.length
    ) {
      return {
        height: uint16Big(bytes, offset + 5),
        width: uint16Big(bytes, offset + 7),
      }
    }
    offset += 2 + length
  }
  return undefined
}

export function inspectImage(bytes: Uint8Array): FaviconImage {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') {
    const width = uint32Big(bytes, 16)
    const height = uint32Big(bytes, 20)
    return { format: 'png', width, height, square: width === height }
  }
  if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) {
    const width = uint16Little(bytes, 6)
    const height = uint16Little(bytes, 8)
    return { format: 'gif', width, height, square: width === height }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimensions = jpegDimensions(bytes)
    return {
      format: 'jpeg',
      ...dimensions,
      square: dimensions ? dimensions.width === dimensions.height : undefined,
    }
  }
  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP'
  ) {
    if (ascii(bytes, 12, 16) === 'VP8X') {
      const width =
        1 +
        (bytes[24] ?? 0) +
        (bytes[25] ?? 0) * 256 +
        (bytes[26] ?? 0) * 65_536
      const height =
        1 +
        (bytes[27] ?? 0) +
        (bytes[28] ?? 0) * 256 +
        (bytes[29] ?? 0) * 65_536
      return { format: 'webp', width, height, square: width === height }
    }
    return { format: 'webp' }
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 4, 8) === 'ftyp' &&
    ['avif', 'avis', 'mif1'].includes(ascii(bytes, 8, 12))
  ) {
    return { format: 'avif' }
  }
  if (
    bytes.length >= 8 &&
    uint16Little(bytes, 0) === 0 &&
    uint16Little(bytes, 2) === 1
  ) {
    const count = Math.min(uint16Little(bytes, 4), 64)
    const dimensions: Array<{ width: number; height: number }> = []
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16
      if (offset + 15 >= bytes.length) break
      dimensions.push({
        width: bytes[offset] === 0 ? 256 : (bytes[offset] ?? 0),
        height: bytes[offset + 1] === 0 ? 256 : (bytes[offset + 1] ?? 0),
      })
    }
    dimensions.sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )
    const largest = dimensions[0]
    return {
      format: 'ico',
      width: largest?.width,
      height: largest?.height,
      square: largest ? largest.width === largest.height : undefined,
      embeddedSizes: dimensions.map(
        ({ width, height }) => `${width}x${height}`,
      ),
    }
  }

  const text = new TextDecoder().decode(
    bytes.slice(0, Math.min(bytes.length, 16_384)),
  )
  const svg = text.match(/<svg\b([^>]*)>/iu)
  if (svg) {
    const attributes = parseAttributes(svg[0])
    const numberValue = (value: string | undefined): number | undefined => {
      const match = value?.match(/^([\d.]+)/u)
      const parsed = match ? Number(match[1]) : Number.NaN
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
    }
    let width = numberValue(attributes.get('width'))
    let height = numberValue(attributes.get('height'))
    const viewBox = attributes
      .get('viewbox')
      ?.trim()
      .split(/[\s,]+/u)
      .map(Number)
    if (
      (!width || !height) &&
      viewBox?.length === 4 &&
      viewBox.every(Number.isFinite)
    ) {
      width = viewBox[2] && viewBox[2] > 0 ? viewBox[2] : width
      height = viewBox[3] && viewBox[3] > 0 ? viewBox[3] : height
    }
    return {
      format: 'svg',
      width,
      height,
      square: width && height ? width === height : undefined,
      scalable: true,
    }
  }
  return { format: 'unknown' }
}

export function expectedType(format: FaviconImage['format']): string[] {
  const types: Record<FaviconImage['format'], string[]> = {
    png: ['image/png'],
    gif: ['image/gif'],
    jpeg: ['image/jpeg', 'image/jpg'],
    webp: ['image/webp'],
    avif: ['image/avif'],
    ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
    svg: ['image/svg+xml'],
    unknown: [],
  }
  return types[format]
}

export function previewContentType(
  format: FaviconImage['format'],
): string | undefined {
  const contentTypes: Partial<Record<FaviconImage['format'], string>> = {
    png: 'image/png',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    ico: 'image/x-icon',
  }
  return contentTypes[format]
}

export function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}
