async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Copy is unavailable')
  await navigator.clipboard.writeText(value)
}

document.addEventListener('click', async (event) => {
  const element = event.target
  if (!(element instanceof Element)) return

  const option = element.closest<HTMLButtonElement>('[data-install-option]')
  if (option) {
    const picker = option.closest<HTMLElement>('[data-install-picker]')
    const command = option.dataset.command
    if (!picker || !command) return

    for (const button of picker.querySelectorAll('[data-install-option]')) {
      button.setAttribute('aria-selected', String(button === option))
    }
    const output = picker.querySelector<HTMLElement>('[data-install-output]')
    const panel = picker.querySelector<HTMLElement>('[role="tabpanel"]')
    const copy = picker.querySelector<HTMLButtonElement>('[data-copy-button]')
    if (output) output.textContent = command
    if (panel) panel.setAttribute('aria-labelledby', option.id)
    if (copy) {
      copy.dataset.copyValue = command
      copy.setAttribute('aria-label', `Copy ${command}`)
    }
    return
  }

  const button = element.closest<HTMLButtonElement>('[data-copy-button]')
  const value = button?.dataset.copyValue
  if (!button || !value) return

  const label = button.querySelector<HTMLElement>('[data-copy-label]')
  try {
    await copyText(value)
    if (label) label.textContent = 'copied'
  } catch {
    if (label) label.textContent = 'select text'
  }
  window.setTimeout(() => {
    if (label) label.textContent = 'copy'
  }, 1600)
})

const scrambleGlyphs = '0123456789_<>/[]{}'
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function scramble(element: HTMLElement): void {
  const source = element.dataset.scramble
  if (!source || reducedMotion.matches || document.hidden) return

  const positions = [...source]
    .map((character, index) => (character === ' ' ? -1 : index))
    .filter((index) => index >= 0)
  const position = positions[Math.floor(Math.random() * positions.length)]
  if (position === undefined) return

  const glyph =
    scrambleGlyphs[Math.floor(Math.random() * scrambleGlyphs.length)]
  const changed = [...source]
  changed[position] = glyph ?? '_'
  element.textContent = changed.join('')
  window.setTimeout(() => {
    element.textContent = source
  }, 110)
}

function scheduleScramble(element: HTMLElement): void {
  const delay = 2400 + Math.random() * 3200
  window.setTimeout(() => {
    scramble(element)
    scheduleScramble(element)
  }, delay)
}

for (const element of document.querySelectorAll<HTMLElement>(
  '[data-scramble]',
)) {
  scheduleScramble(element)
}
