// Wraps every markdown code block in the .code-frame chrome at build time:
// the dotted offset shadow and the copy button are static HTML, so pages do
// not reflow when client JavaScript arrives. The button's click handler is
// bound by the small script in BaseLayout.

const COPY_PATH =
  'M20 22H8v-2h12v2ZM8 20H6v-2H4v-2h2V8h2v12Zm14 0h-2V8h2v12ZM4 16H2V4h2v12ZM18 6h2v2H8V6h8V4h2v2Zm-2-2H4V2h12v2Z'
const CHECK_PATH =
  'M20 22H8v-2h12v2ZM8 20H6v-2H4v-2h2V8h2v12Zm14 0h-2V8h2v12Zm-8-3h-2v-2h2v2ZM4 16H2V4h2v12Zm8-1h-2v-2h2v2Zm4 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm0-7h2v2H8V6h8V4h2v2Zm-2-2H4V2h12v2Z'

function icon(path, hidden, marker) {
  return {
    type: 'element',
    tagName: 'svg',
    properties: {
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      'aria-hidden': 'true',
      className: hidden ? ['size-4', 'hidden'] : ['size-4'],
      [marker]: true,
    },
    children: [
      {
        type: 'element',
        tagName: 'path',
        properties: { d: path },
        children: [],
      },
    ],
  }
}

function copyButton() {
  return {
    type: 'element',
    tagName: 'button',
    properties: {
      type: 'button',
      className:
        'flex size-8 shrink-0 cursor-pointer items-center justify-center bg-background text-foreground-muted transition-colors hover:text-foreground'.split(
          ' ',
        ),
      ariaLabel: 'Copy code',
      dataCodeCopy: true,
    },
    children: [
      icon(COPY_PATH, false, 'dataCopyIcon'),
      icon(CHECK_PATH, true, 'dataCopyCheckIcon'),
    ],
  }
}

// The button rides a full-height strip whose gradient fades the code out
// underneath it, so the button always sits on solid background.
function buttonStrip() {
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className:
        'absolute bottom-[2px] right-[2px] top-[2px] flex items-start bg-linear-to-l from-background from-70% to-transparent pl-6 pr-1.5 pt-1.5'.split(
          ' ',
        ),
    },
    children: [copyButton()],
  }
}

function frame(pre) {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['code-frame'] },
    children: [pre, buttonStrip()],
  }
}

function walk(node) {
  if (!Array.isArray(node.children)) return
  node.children = node.children.map((child) => {
    if (child.type === 'element') {
      if (child.tagName === 'pre') return frame(child)
      walk(child)
    }
    return child
  })
}

export default function rehypeCodeFrame() {
  return (tree) => {
    walk(tree)
  }
}
