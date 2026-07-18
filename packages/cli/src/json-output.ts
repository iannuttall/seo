import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import type { Writable } from 'node:stream'

const BUFFER_SIZE = 64 * 1024

class BufferedWriter {
  private buffer = ''

  constructor(private readonly stream: Writable) {}

  async write(value: string): Promise<void> {
    this.buffer += value
    if (this.buffer.length >= BUFFER_SIZE) await this.flush()
  }

  async flush(): Promise<void> {
    if (!this.buffer) return
    const chunk = this.buffer
    this.buffer = ''
    if (!this.stream.write(chunk)) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          cleanup()
          resolve()
        }
        const onError = (error: Error) => {
          cleanup()
          reject(error)
        }
        const cleanup = () => {
          this.stream.off('drain', onDrain)
          this.stream.off('error', onError)
        }
        this.stream.once('drain', onDrain)
        this.stream.once('error', onError)
      })
    }
  }
}

function indentation(depth: number): string {
  return '  '.repeat(depth)
}

function jsonValue(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'toJSON' in value &&
    typeof value.toJSON === 'function'
  ) {
    return value.toJSON()
  }
  return value
}

async function writeValue(
  writer: BufferedWriter,
  input: unknown,
  depth: number,
  ancestors: Set<object>,
  arrayItem = false,
): Promise<boolean> {
  const value = jsonValue(input)
  if (value === null) {
    await writer.write('null')
    return true
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    await writer.write(JSON.stringify(value))
    return true
  }
  if (typeof value === 'number') {
    await writer.write(Number.isFinite(value) ? String(value) : 'null')
    return true
  }
  if (typeof value === 'bigint') {
    JSON.stringify(value)
  }
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    if (arrayItem) await writer.write('null')
    return arrayItem
  }
  if (!value || typeof value !== 'object') return false
  if (ancestors.has(value)) {
    throw new TypeError('Converting circular structure to JSON')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        await writer.write('[]')
        return true
      }
      await writer.write('[\n')
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) await writer.write(',\n')
        await writer.write(indentation(depth + 1))
        await writeValue(writer, value[index], depth + 1, ancestors, true)
      }
      await writer.write(`\n${indentation(depth)}]`)
      return true
    }

    const entries = Object.entries(value).filter(([, item]) => {
      const normalized = jsonValue(item)
      return !['undefined', 'function', 'symbol'].includes(typeof normalized)
    })
    if (entries.length === 0) {
      await writer.write('{}')
      return true
    }
    await writer.write('{\n')
    for (let index = 0; index < entries.length; index += 1) {
      const [key, item] = entries[index] as [string, unknown]
      if (index > 0) await writer.write(',\n')
      await writer.write(`${indentation(depth + 1)}${JSON.stringify(key)}: `)
      await writeValue(writer, item, depth + 1, ancestors)
    }
    await writer.write(`\n${indentation(depth)}}`)
    return true
  } finally {
    ancestors.delete(value)
  }
}

export async function writeJsonStream(
  stream: Writable,
  value: unknown,
): Promise<void> {
  const writer = new BufferedWriter(stream)
  const written = await writeValue(writer, value, 0, new Set())
  if (!written) await writer.write('undefined')
  await writer.write('\n')
  await writer.flush()
}

export async function writeJsonOutput(
  path: string | undefined,
  value: unknown,
): Promise<void> {
  if (!path) {
    await writeJsonStream(process.stdout, value)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  const stream = createWriteStream(path)
  try {
    await writeJsonStream(stream, value)
    stream.end()
    await finished(stream)
  } catch (error) {
    stream.destroy()
    throw error
  }
  process.stdout.write(`Wrote ${path}\n`)
}
