// The one floating tooltip the blog charts share, drawn like the stats
// page's: a dark panel by the pointer with a title, a line per value (with a
// colour dot when there is more than one) and quieter notes under them.

export type TipLine = { name?: string; value: string; colour?: string }
export type Tip = { title: string; lines?: TipLine[]; notes?: string[] }

let element: HTMLElement | null = null

const node = (tag: string, className: string, text = '') => {
  const item = document.createElement(tag)
  item.className = className
  if (text) item.textContent = text
  return item
}

const tooltip = () => {
  if (element) return element
  element = node(
    'div',
    'pointer-events-none fixed top-0 left-0 z-50 min-w-36 max-w-64 rounded-md bg-foreground px-3 py-2 text-xs leading-5 text-background',
  )
  element.setAttribute('role', 'tooltip')
  element.dataset.agentMarkdown = 'exclude'
  element.hidden = true
  document.body.append(element)
  // Hide when the page really moves; some scroll events report no change.
  let scrolled = window.scrollY
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY !== scrolled) hideTip()
      scrolled = window.scrollY
    },
    { passive: true },
  )
  return element
}

/** Show the tooltip next to a viewport point, flipped to stay on screen. */
export function showTip(tip: Tip, x: number, y: number) {
  const box = tooltip()
  box.replaceChildren(node('p', 'font-medium', tip.title))
  for (const line of tip.lines ?? []) {
    const row = node('p', 'flex items-center justify-between gap-4')
    const name = node('span', 'inline-flex items-center gap-1.5')
    if (line.colour) {
      const dot = node('span', 'inline-block size-2 shrink-0 rounded-full')
      dot.style.background = line.colour
      name.append(dot)
    }
    if (line.name) name.append(document.createTextNode(line.name))
    row.append(name, node('span', 'tabular-nums', line.value))
    box.append(row)
  }
  for (const note of tip.notes ?? []) box.append(node('p', 'opacity-70', note))
  box.hidden = false
  const size = box.getBoundingClientRect()
  const left =
    x + 14 + size.width > window.innerWidth ? x - 14 - size.width : x + 14
  const top = Math.max(
    8,
    Math.min(y - size.height - 10, window.innerHeight - size.height - 8),
  )
  box.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`
}

/** Show the tooltip above the middle of an element, for keys and taps. */
export function showTipAt(tip: Tip, target: Element) {
  const box = target.getBoundingClientRect()
  showTip(tip, box.left + box.width / 2, box.top)
}

export function hideTip() {
  if (element) element.hidden = true
}
