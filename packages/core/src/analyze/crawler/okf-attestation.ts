import { posix } from 'node:path'

type Frontmatter = Record<string, unknown>

type AttestationDocument = {
  path: string
  frontmatter?: Frontmatter
  body: string
}

export type OkfAttestedComputationResult = {
  complete: boolean
  computation: 'inline' | 'file' | 'invalid'
}

function mapping(value: unknown): Frontmatter | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Frontmatter)
    : undefined
}

function internalTarget(sourcePath: string, value: string): string | undefined {
  if (
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return undefined
  }
  const withoutFragment = value.split(/[?#]/, 1)[0] ?? ''
  if (!withoutFragment) return undefined
  const raw = withoutFragment.startsWith('/')
    ? withoutFragment.slice(1)
    : posix.join(posix.dirname(sourcePath), withoutFragment)
  return posix.normalize(raw)
}

function targetExists(target: string, paths: Set<string>): boolean {
  if (paths.has(target)) return true
  if (paths.has(`${target}.md`)) return true
  if (paths.has(posix.join(target, 'index.md'))) return true
  return false
}

function fencedComputationCount(body: string): number {
  const heading = body.match(/^#\s+Computation[ \t]*$/m)
  if (heading?.index === undefined) return 0
  const afterHeading = body.slice(heading.index + heading[0].length)
  const nextHeading = afterHeading.search(/^#\s+\S/m)
  const section =
    nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)
  let open: { marker: '`' | '~'; length: number } | undefined
  let blocks = 0
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    const fence = match?.[1]
    if (!fence) continue
    const marker = fence[0] as '`' | '~'
    if (!open) {
      open = { marker, length: fence.length }
      continue
    }
    if (
      marker === open.marker &&
      fence.length >= open.length &&
      !(match?.[2] ?? '').trim()
    ) {
      blocks++
      open = undefined
    }
  }
  return blocks
}

function validatePath(
  sourcePath: string,
  field: string,
  value: unknown,
  paths: Set<string>,
  warn: (message: string) => void,
): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    warn(`${field} should be a non-empty path or URL.`)
    return false
  }
  const target = internalTarget(sourcePath, value)
  if (target && !targetExists(target, paths)) {
    warn(`${field} bundle path was not supplied: ${value}`)
    return false
  }
  return true
}

export function validateOkfAttestedComputation(
  document: AttestationDocument,
  paths: Set<string>,
  addWarning: (message: string) => void,
): OkfAttestedComputationResult | undefined {
  if (document.frontmatter?.type !== 'Attested Computation') return undefined

  let complete = true
  const warn = (message: string) => {
    complete = false
    addWarning(message)
  }
  const runtime = document.frontmatter.runtime
  if (typeof runtime !== 'string' || !runtime.trim()) {
    warn('Attested Computation runtime should be a non-empty string.')
  }

  const parameters = document.frontmatter.parameters
  if (parameters !== undefined) {
    if (!Array.isArray(parameters)) {
      warn('Attested Computation parameters should be a list.')
    } else {
      const names = new Set<string>()
      for (const [index, item] of parameters.entries()) {
        const parameter = mapping(item)
        if (!parameter) {
          warn(`parameters[${index}] should be a mapping.`)
          continue
        }
        if (typeof parameter.name !== 'string' || !parameter.name.trim()) {
          warn(`parameters[${index}].name should be a non-empty string.`)
        } else if (names.has(parameter.name)) {
          warn(
            `Attested Computation parameter ${parameter.name} is duplicated.`,
          )
        } else {
          names.add(parameter.name)
        }
        if (typeof parameter.type !== 'string' || !parameter.type.trim()) {
          warn(`parameters[${index}].type should be a non-empty string.`)
        }
        if (typeof parameter.required !== 'boolean') {
          warn(`parameters[${index}].required should be true or false.`)
        }
      }
    }
  }

  const computation = document.frontmatter.computation
  const inlineComputations = fencedComputationCount(document.body)
  let computationKind: OkfAttestedComputationResult['computation'] = 'invalid'
  if (computation !== undefined) {
    if (
      validatePath(
        document.path,
        'Attested Computation computation',
        computation,
        paths,
        warn,
      )
    ) {
      computationKind = 'file'
    }
    if (inlineComputations) {
      warn(
        'Attested Computation should use either computation or one inline # Computation fence, not both.',
      )
      computationKind = 'invalid'
    }
  } else if (inlineComputations === 1) {
    computationKind = 'inline'
  } else {
    warn(
      'Attested Computation needs one fenced code block under # Computation when computation is absent.',
    )
  }

  const executor = mapping(document.frontmatter.executor)
  if (!executor) {
    warn('Attested Computation executor should be a mapping.')
  } else {
    validatePath(
      document.path,
      'executor.resource',
      executor.resource,
      paths,
      warn,
    )
    const receipt = executor.receipt
    if (!Array.isArray(receipt) || !receipt.length) {
      warn('executor.receipt should be a non-empty list of field names.')
    } else {
      const fields = new Set<string>()
      for (const [index, field] of receipt.entries()) {
        if (typeof field !== 'string' || !field.trim()) {
          warn(`executor.receipt[${index}] should be a non-empty string.`)
        } else if (fields.has(field)) {
          warn(`executor.receipt field ${field} is duplicated.`)
        } else {
          fields.add(field)
        }
      }
    }
  }

  const attester = mapping(document.frontmatter.attester)
  if (!attester) {
    warn('Attested Computation attester should be a mapping.')
  } else {
    validatePath(
      document.path,
      'attester.resource',
      attester.resource,
      paths,
      warn,
    )
  }

  return { complete, computation: computationKind }
}
