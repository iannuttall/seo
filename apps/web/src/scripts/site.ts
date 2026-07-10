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
    if (copy) copy.dataset.copyValue = command
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
