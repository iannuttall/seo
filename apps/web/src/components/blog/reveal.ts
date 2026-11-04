// Scroll-in animation for blog exhibits. The page head adds `motion` to
// <html> when motion is allowed and IntersectionObserver exists; only then
// do the components' CSS start an exhibit in its empty state. So the first
// paint is already empty, and a page without scripts or with reduced motion
// shows the final state. This flips an element to "shown" the first time a
// third of it is on screen; the component's CSS animates the change.
// `onShow` runs at that moment, for work CSS cannot do.
export function reveal(
  selector: string,
  onShow?: (element: HTMLElement) => void,
) {
  if (!document.documentElement.classList.contains('motion')) return
  const elements = document.querySelectorAll<HTMLElement>(selector)
  if (elements.length === 0) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const element = entry.target as HTMLElement
        element.dataset.reveal = 'shown'
        observer.unobserve(element)
        onShow?.(element)
      }
    },
    { threshold: 0.33 },
  )
  for (const element of elements) observer.observe(element)
}
