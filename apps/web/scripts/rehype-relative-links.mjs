// Turns links to this site in Markdown content into relative paths at build
// time. The policy files live in the repository root and use full URLs so
// they also work on GitHub; on the site the same links should stay local.

const SITE = 'https://seoskill.dev'

function relative(href) {
  if (href === SITE || href === `${SITE}/`) return '/'
  if (href.startsWith(`${SITE}/`)) return href.slice(SITE.length)
  return href
}

function walk(node) {
  if (node.type === 'element' && node.tagName === 'a') {
    const href = node.properties?.href
    if (typeof href === 'string') node.properties.href = relative(href)
  }
  if (Array.isArray(node.children)) node.children.forEach(walk)
}

export default function rehypeRelativeLinks() {
  return (tree) => walk(tree)
}
