import { LLMS_TXT_LIMITS } from './llms-txt-generator.mjs'

export const LLMS_TXT_VALIDATOR_LIMITS = Object.freeze({
  maxBytes: LLMS_TXT_LIMITS.maxBytes,
  maxIssues: 100,
  maxLinks: LLMS_TXT_LIMITS.maxLinks,
  maxSections: LLMS_TXT_LIMITS.maxSections,
})

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

function issue(code, message, line) {
  return line ? { code, message, line } : { code, message }
}

function heading(line) {
  const match = line.match(/^ {0,3}(#{1,6})[\t ]+(.+?)(?:[\t ]+#+[\t ]*)?$/u)
  if (!match) return undefined
  return { level: match[1].length, text: match[2].trim() }
}

function closingCharacter(value, start, target) {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1
      continue
    }
    if (value[index] === target) return index
  }
  return -1
}

function closingParenthesis(value, start) {
  let depth = 1
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1
      continue
    }
    if (value[index] === '(') depth += 1
    if (value[index] !== ')') continue
    depth -= 1
    if (depth === 0) return index
  }
  return -1
}

function linkDestination(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>')
    if (end < 0) return undefined
    return trimmed.slice(1, end).trim()
  }
  return trimmed.match(/^(?:\\.|[^\s])+/u)?.[0]
}

function parseFileListItem(line) {
  const bullet = line.match(/^ {0,3}[-+*][\t ]+(.+)$/u)
  if (!bullet) return undefined
  const value = bullet[1]
  if (!value.startsWith('['))
    return { error: 'Start the list item with a Markdown link.' }

  const labelEnd = closingCharacter(value, 1, ']')
  if (labelEnd < 0 || value[labelEnd + 1] !== '(') {
    return {
      error:
        'Use a Markdown link in the form [label](https://example.com/page).',
    }
  }

  const urlStart = labelEnd + 2
  const urlEnd = closingParenthesis(value, urlStart)
  if (urlEnd < 0) {
    return { error: 'Close the Markdown link with a right parenthesis.' }
  }

  const label = value
    .slice(1, labelEnd)
    .replace(/\\([\\\]])/gu, '$1')
    .trim()
  const destination = linkDestination(value.slice(urlStart, urlEnd))
  const notes = value.slice(urlEnd + 1).trim()
  if (!label) return { error: 'Add a label inside the Markdown link.' }
  if (!destination) return { error: 'Add a URL inside the Markdown link.' }
  if (notes && !notes.startsWith(':')) {
    return { error: 'Put optional link notes after a colon.' }
  }

  try {
    const url = new URL(destination)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'Use a complete http or https URL.' }
    }
    return { url: url.toString() }
  } catch {
    return { error: 'Use a complete http or https URL.' }
  }
}

function limitIssues(errors, warnings) {
  const visibleErrors = errors.slice(0, LLMS_TXT_VALIDATOR_LIMITS.maxIssues)
  const remaining = Math.max(
    0,
    LLMS_TXT_VALIDATOR_LIMITS.maxIssues - visibleErrors.length,
  )
  const visibleWarnings = warnings.slice(0, remaining)
  return {
    errors: visibleErrors,
    warnings: visibleWarnings,
    issueStats: {
      errors: errors.length,
      warnings: warnings.length,
      omitted:
        errors.length +
        warnings.length -
        visibleErrors.length -
        visibleWarnings.length,
    },
  }
}

/**
 * Check the local Markdown shape described by the llms.txt proposal.
 *
 * This does not fetch the file or any linked pages. The live crawl report owns
 * response, redirect, content type, destination, and crawl evidence.
 */
export function validateLlmsTxt(value) {
  const raw = String(value ?? '')
  const bytes = byteLength(raw)
  const normalized = raw.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const lines = normalized.split('\n')
  const errors = []
  const warnings = []
  const sections = []
  const seenHeadings = new Set()
  const seenUrls = new Set()
  let links = 0
  let hasSummary = false

  if (bytes > LLMS_TXT_VALIDATOR_LIMITS.maxBytes) {
    errors.push(
      issue(
        'file-too-large',
        `The file is ${bytes.toLocaleString()} bytes. Keep it under ${LLMS_TXT_VALIDATOR_LIMITS.maxBytes.toLocaleString()} bytes.`,
      ),
    )
  }

  if (!normalized.trim()) {
    errors.push(issue('empty-file', 'Paste or open an llms.txt file to check.'))
    const limited = limitIssues(errors, warnings)
    return {
      ...limited,
      stats: { bytes, estimatedTokens: 0, lines: 0, links: 0, sections: 0 },
    }
  }

  const firstHeading = heading(lines[0])
  if (firstHeading?.level !== 1) {
    errors.push(
      issue(
        'missing-title',
        'Start the file with one H1 project or site name, such as # Example docs.',
        1,
      ),
    )
  }

  for (const [index, line] of lines.entries()) {
    const found = heading(line)
    if (!found) {
      if (/^ {0,3}#{1,6}[\t ]*$/u.test(line)) {
        errors.push(
          issue('empty-heading', 'Add text after the heading mark.', index + 1),
        )
      }
      continue
    }
    if (found.level === 1 && index !== 0) {
      errors.push(
        issue(
          'extra-title',
          'Keep one H1 at the start of the file. Use H2 for file-list sections.',
          index + 1,
        ),
      )
    }
    if (found.level > 2) {
      errors.push(
        issue(
          'unsupported-heading',
          'The proposal uses one H1 and H2 file-list sections. Remove this deeper heading.',
          index + 1,
        ),
      )
    }
    if (found.level === 2) sections.push({ line: index + 1, text: found.text })
  }

  let cursor = 1
  while (cursor < lines.length && !lines[cursor].trim()) cursor += 1
  if (lines[cursor]?.match(/^ {0,3}>/u)) {
    hasSummary = true
    while (cursor < lines.length && lines[cursor].match(/^ {0,3}>/u))
      cursor += 1
  }
  if (!hasSummary) {
    warnings.push(
      issue(
        'missing-summary',
        'A short blockquote summary is optional, but it helps a reader understand the file.',
      ),
    )
  }

  if (sections.length > LLMS_TXT_VALIDATOR_LIMITS.maxSections) {
    errors.push(
      issue(
        'too-many-sections',
        `Keep the file to ${LLMS_TXT_VALIDATOR_LIMITS.maxSections} sections or fewer.`,
      ),
    )
  }

  const optionalSections = sections.filter(({ text }) => text === 'Optional')
  if (optionalSections.length > 1) {
    for (const section of optionalSections.slice(1)) {
      errors.push(
        issue(
          'duplicate-optional-section',
          'Keep one Optional section for secondary links.',
          section.line,
        ),
      )
    }
  }
  const optionalCase = sections.filter(
    ({ text }) => text.toLowerCase() === 'optional' && text !== 'Optional',
  )
  for (const section of optionalCase) {
    warnings.push(
      issue(
        'optional-heading-case',
        'Use the exact heading Optional when these links can be skipped for shorter context.',
        section.line,
      ),
    )
  }
  const misplacedOptional = optionalSections.find(
    ({ line }) => sections.at(-1)?.line !== line,
  )
  if (misplacedOptional) {
    warnings.push(
      issue(
        'optional-section-order',
        'Put the Optional section last so primary file lists stay together.',
        misplacedOptional.line,
      ),
    )
  }

  for (const [sectionIndex, section] of sections.entries()) {
    const key = section.text.toLocaleLowerCase('en-US')
    if (seenHeadings.has(key)) {
      warnings.push(
        issue(
          'duplicate-section-heading',
          `The section heading ${section.text} appears more than once.`,
          section.line,
        ),
      )
    }
    seenHeadings.add(key)

    const start = section.line
    const end = sections[sectionIndex + 1]?.line - 1 || lines.length
    let sectionLinks = 0
    for (let index = start; index < end; index += 1) {
      const line = lines[index]
      if (!line.trim()) continue
      const item = parseFileListItem(line)
      if (!item) {
        errors.push(
          issue(
            'unexpected-section-content',
            'Use a Markdown list of links below each H2 section.',
            index + 1,
          ),
        )
        continue
      }
      if (item.error) {
        errors.push(issue('invalid-file-link', item.error, index + 1))
        continue
      }
      links += 1
      sectionLinks += 1
      if (seenUrls.has(item.url)) {
        errors.push(
          issue(
            'duplicate-link',
            `${item.url} appears more than once.`,
            index + 1,
          ),
        )
      }
      seenUrls.add(item.url)
    }
    if (sectionLinks === 0) {
      warnings.push(
        issue(
          'empty-section',
          `The ${section.text} section does not contain a valid file link yet.`,
          section.line,
        ),
      )
    }
  }

  if (links > LLMS_TXT_VALIDATOR_LIMITS.maxLinks) {
    errors.push(
      issue(
        'too-many-links',
        `Keep the file to ${LLMS_TXT_VALIDATOR_LIMITS.maxLinks} links or fewer.`,
      ),
    )
  }
  if (sections.length === 0) {
    warnings.push(
      issue(
        'no-links',
        'The H1 is enough for the proposal, but the file does not point to any useful pages yet.',
      ),
    )
  }

  const countedLines = normalized.endsWith('\n')
    ? Math.max(0, lines.length - 1)
    : lines.length
  const limited = limitIssues(errors, warnings)
  return {
    ...limited,
    stats: {
      bytes,
      estimatedTokens: Math.ceil(raw.length / 4),
      lines: countedLines,
      links,
      sections: sections.length,
    },
  }
}
