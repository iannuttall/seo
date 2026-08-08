export const LLMS_TXT_LIMITS = Object.freeze({
  maxBytes: 100_000,
  maxLinks: 100,
  maxSections: 12,
})

function singleLine(value) {
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function escapeLabel(value) {
  return singleLine(value).replaceAll('\\', '\\\\').replaceAll(']', '\\]')
}

function absoluteHttpUrl(value) {
  try {
    const url = new URL(singleLine(value))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

function issue(code, message) {
  return { code, message }
}

/**
 * Build a small llms.txt file from explicit user input.
 *
 * This intentionally does not crawl or fetch a site. The crawl-driven
 * generator in packages/core owns automatic page selection and source
 * evidence. This browser helper only owns the proposal's Markdown shape.
 */
export function generateLlmsTxt(input) {
  const errors = []
  const warnings = []
  const title = singleLine(input?.title)
  const summary = singleLine(input?.summary)
  const details = singleLine(input?.details)
  const suppliedSections = Array.isArray(input?.sections) ? input.sections : []

  if (!title) {
    errors.push(issue('missing-title', 'Add a site or project name.'))
  }
  if (title.includes('#')) {
    errors.push(
      issue(
        'invalid-title',
        'Remove heading marks from the site or project name.',
      ),
    )
  }
  if (suppliedSections.length > LLMS_TXT_LIMITS.maxSections) {
    errors.push(
      issue(
        'too-many-sections',
        `Keep the file to ${LLMS_TXT_LIMITS.maxSections} sections or fewer.`,
      ),
    )
  }

  const sections = []
  const seenUrls = new Set()
  let suppliedLinkCount = 0

  for (const [sectionIndex, suppliedSection] of suppliedSections.entries()) {
    const suppliedLinks = Array.isArray(suppliedSection?.links)
      ? suppliedSection.links
      : []
    const nonEmptyLinks = suppliedLinks.filter((link) =>
      [link?.label, link?.url, link?.description].some((value) =>
        singleLine(value),
      ),
    )
    if (nonEmptyLinks.length === 0) continue

    const heading = suppliedSection?.optional
      ? 'Optional'
      : singleLine(suppliedSection?.heading)
    if (!heading) {
      errors.push(
        issue(
          'missing-section-heading',
          `Add a heading for section ${sectionIndex + 1}.`,
        ),
      )
    }
    if (heading.includes('#')) {
      errors.push(
        issue(
          'invalid-section-heading',
          `Remove heading marks from section ${sectionIndex + 1}.`,
        ),
      )
    }

    const links = []
    for (const [linkIndex, suppliedLink] of nonEmptyLinks.entries()) {
      suppliedLinkCount += 1
      const label = escapeLabel(suppliedLink?.label)
      const rawUrl = singleLine(suppliedLink?.url)
      const url = absoluteHttpUrl(rawUrl)
      const description = singleLine(suppliedLink?.description)

      if (!label) {
        errors.push(
          issue(
            'missing-link-label',
            `Add a label for link ${linkIndex + 1} in section ${sectionIndex + 1}.`,
          ),
        )
      }
      if (!url) {
        errors.push(
          issue(
            'invalid-link-url',
            `Use a complete http or https URL for link ${linkIndex + 1} in section ${sectionIndex + 1}.`,
          ),
        )
      } else if (seenUrls.has(url)) {
        errors.push(issue('duplicate-link', `${url} appears more than once.`))
      } else {
        seenUrls.add(url)
      }

      if (label && url) links.push({ label, url, description })
    }

    if (heading && links.length > 0) sections.push({ heading, links })
  }

  if (suppliedLinkCount > LLMS_TXT_LIMITS.maxLinks) {
    errors.push(
      issue(
        'too-many-links',
        `Keep the file to ${LLMS_TXT_LIMITS.maxLinks} links or fewer.`,
      ),
    )
  }
  if (!summary) {
    warnings.push(
      issue(
        'missing-summary',
        'A short summary is optional, but it helps a reader understand the file.',
      ),
    )
  }
  if (sections.length === 0 && errors.length === 0) {
    warnings.push(
      issue(
        'no-links',
        'The title is enough for the proposal, but this draft does not point to any useful pages yet.',
      ),
    )
  }

  if (errors.length > 0) {
    return {
      content: '',
      errors,
      warnings,
      stats: { bytes: 0, estimatedTokens: 0, links: 0, sections: 0 },
    }
  }

  const lines = [`# ${title}`, '']
  if (summary) lines.push(`> ${summary}`, '')
  if (details) lines.push(details, '')

  for (const section of sections) {
    lines.push(`## ${section.heading}`, '')
    for (const link of section.links) {
      const description = link.description ? `: ${link.description}` : ''
      lines.push(`- [${link.label}](${link.url})${description}`)
    }
    lines.push('')
  }

  const content = `${lines.join('\n').trimEnd()}\n`
  const bytes = byteLength(content)
  if (bytes > LLMS_TXT_LIMITS.maxBytes) {
    return {
      content: '',
      errors: [
        issue(
          'file-too-large',
          `The draft is ${bytes.toLocaleString()} bytes. Keep it under ${LLMS_TXT_LIMITS.maxBytes.toLocaleString()} bytes.`,
        ),
      ],
      warnings,
      stats: {
        bytes,
        estimatedTokens: Math.ceil(content.length / 4),
        links: seenUrls.size,
        sections: sections.length,
      },
    }
  }

  return {
    content,
    errors,
    warnings,
    stats: {
      bytes,
      estimatedTokens: Math.ceil(content.length / 4),
      links: seenUrls.size,
      sections: sections.length,
    },
  }
}
