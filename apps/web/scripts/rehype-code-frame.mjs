// Wraps Markdown code blocks in the shared code frame with a copy button at
// build time, so the page does not shift when client JavaScript arrives. The
// base layout binds the copy behaviour.
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'

const icon = (iconNode, hidden, marker) => ({
  type: 'element',
  tagName: 'svg',
  properties: {
    viewBox: '0 0 24 24',
    fill: 'none',
    ariaHidden: 'true',
    className: hidden ? ['code-copy-icon', 'hidden'] : ['code-copy-icon'],
    [marker]: true,
  },
  children: iconNode.map(([tagName, { key: _key, ...properties }]) => ({
    type: 'element',
    tagName,
    properties: { ...properties, strokeWidth: 1.7 },
    children: [],
  })),
})

const copyButton = () => ({
  type: 'element',
  tagName: 'button',
  properties: {
    type: 'button',
    className: ['code-copy-button'],
    ariaLabel: 'Copy code',
    dataCodeCopy: true,
  },
  children: [
    icon(Copy01Icon, false, 'dataCopyIcon'),
    icon(Tick02Icon, true, 'dataCopyCheckIcon'),
  ],
})

const frame = (pre) => ({
  type: 'element',
  tagName: 'div',
  properties: { className: ['code-frame'] },
  children: [
    pre,
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['code-copy-strip'] },
      children: [copyButton()],
    },
  ],
})

const walk = (node) => {
  if (!Array.isArray(node.children)) return
  node.children = node.children.map((child) => {
    if (child.type !== 'element') return child
    if (child.tagName === 'pre') return frame(child)
    walk(child)
    return child
  })
}

export default function rehypeCodeFrame() {
  return (tree) => walk(tree)
}
