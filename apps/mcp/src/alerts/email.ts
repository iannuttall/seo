// Every SEO Skill email in one plain layout, copied from Ian's newsletter:
// default fonts, no colours, no tables, no images, so it reads like a plain
// message in every client. Each email is written as Markdown and drawn
// here as HTML, with a matching plain-text part. No open pixel or click
// tracking.

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
}

// Minimal HTML to plain text: links keep their URL.
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, text: string) =>
        `${text.replace(/<[^>]*>/g, '').trim()} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n---\n\n')
    .replace(/<\/(p|div|h[1-6]|li|pre|blockquote|tr|ul)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_m, name: string) => ENTITIES[name] ?? '',
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(- [^\n]*)\n\n(?=- )/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function previewText(value: string, limit = 150): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

// One line of Markdown: [text](url) links; everything else is text.
function inline(text: string): string {
  let out = ''
  let at = 0
  for (const match of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    out += esc(text.slice(at, match.index))
    out += `<a href="${esc(match[2] ?? '')}">${esc(match[1] ?? '')}</a>`
    at = (match.index ?? 0) + match[0].length
  }
  return out + esc(text.slice(at))
}

// The Markdown the emails use: headings, paragraphs, "- " lists, ``` code
// blocks and --- rules.
export function markdownToHtml(markdown: string): string {
  const out: string[] = []
  const lines = markdown.split('\n')
  let paragraph: string[] = []
  let list: string[] = []
  const flush = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`)
    }
    if (list.length) {
      out.push(
        `<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`,
      )
    }
    paragraph = []
    list = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.startsWith('```')) {
      flush()
      const code: string[] = []
      for (
        index += 1;
        index < lines.length && !lines[index]?.startsWith('```');
        index += 1
      ) {
        code.push(lines[index] ?? '')
      }
      out.push(`<pre>${esc(code.join('\n'))}</pre>`)
      continue
    }
    const heading = /^(#{1,4}) (.+)$/.exec(line)
    if (heading) {
      flush()
      const level = heading[1]?.length ?? 1
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`)
    } else if (line.trim() === '---') {
      flush()
      out.push('<hr>')
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush()
      list.push(line.slice(2))
    } else if (!line.trim()) {
      flush()
    } else {
      if (list.length) flush()
      paragraph.push(line)
    }
  }
  flush()
  return out.join('\n')
}

// Stops inboxes filling a short preheader with visible body copy.
const PREVIEW_PADDING = '&#847;&zwnj;&nbsp;'.repeat(50)

// The mailing address, with zero-width spaces so clients do not link it.
const ADDRESS =
  '2\u200B0-\u200B2\u200B2 W\u200Benlock R\u200Boad, L\u200Bond\u200Bon, N\u200B1 7\u200BG\u200BU'
const ADDRESS_TEXT = '20-22 Wenlock Road, London, N1 7GU'

export type Footer = { why: string; prefs: string; unsubscribe: string }

function footerHtml(footer: Footer): string {
  const plainLink = 'color:#777!important;text-decoration:none!important'
  const actionLink =
    'color:#777!important;text-decoration:underline!important;-webkit-text-fill-color:#777!important'
  return `<p style="margin-top:32px;color:#777;font-size:13px;line-height:1.5;font-family:Arial,Helvetica,sans-serif">${esc(footer.why)}<br><a class="footer-link" href="${esc(footer.prefs)}" style="${actionLink}">Change alerts</a> or <a class="footer-link" href="${esc(footer.unsubscribe)}" style="${actionLink}">unsubscribe</a><br><span class="footer-address" x-apple-data-detectors="false" style="${plainLink};pointer-events:none;cursor:text">${ADDRESS}</span></p>`
}

function footerText(footer: Footer): string {
  return `${footer.why}\nChange alerts: ${footer.prefs}\nUnsubscribe: ${footer.unsubscribe}\n${ADDRESS_TEXT}`
}

export function layout(input: {
  title: string
  preview: string
  body: string
  footer: string
}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>${esc(input.title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;-webkit-text-size-adjust:100%}
h1,h2,h3,h4{font-size:14px;line-height:1.5}
a{overflow-wrap:anywhere;word-break:break-word}
code,pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;background:none;border:0;padding:0}
hr{border:0;border-top:1px solid #ccc;margin:24px 0}
.footer-link,.footer-link:link,.footer-link:visited,.footer-link:hover,.footer-link:active{color:#777!important;text-decoration:underline!important;-webkit-text-fill-color:#777!important}
.footer-address,.footer-address a{color:#777!important;text-decoration:none!important;pointer-events:none!important;cursor:text!important}
@media only screen and (max-width:600px){
body,.email-content,h1,h2,h3,h4{font-size:16px!important}
}
</style></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;-webkit-text-size-adjust:100%">
<div aria-hidden="true" style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${esc(input.preview)}${PREVIEW_PADDING}</div>
<div class="email-content" style="max-width:450px;margin:0;padding:0;text-align:left">
${input.body}
${input.footer}
</div>
</body></html>`
}

// One email from its Markdown: the HTML and the matching plain text.
export function renderEmail(input: {
  subject: string
  preview: string
  markdown: string
  footer: Footer
}): { html: string; text: string } {
  const body = markdownToHtml(input.markdown)
  return {
    html: layout({
      title: input.subject,
      preview: previewText(input.preview),
      body,
      footer: footerHtml(input.footer),
    }),
    text: `${htmlToText(body)}\n\n${footerText(input.footer)}`,
  }
}
