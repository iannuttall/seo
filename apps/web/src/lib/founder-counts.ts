import { shortCount } from './site'

// Browser only. Swaps the follower counts built into the page for the
// Worker's daily ones from /api/founder. Any failure keeps the built numbers.
const nodes = document.querySelectorAll<HTMLElement>('[data-founder-count]')
if (nodes.length > 0) {
  fetch('/api/founder', { headers: { accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((counts: Record<string, unknown> | null) => {
      for (const node of nodes) {
        const value = counts?.[node.dataset.founderCount ?? '']
        if (typeof value === 'number' && value > 0)
          node.textContent = shortCount(value)
      }
    })
    .catch(() => undefined)
}
