export { default as Input } from './input.astro'

export const inputVariants = {
  variant: {
    default: 'border-input border bg-card',
    ghost:
      'border border-transparent bg-transparent shadow-none hover:bg-secondary focus-visible:bg-background focus-visible:border-ring',
  },
  size: {
    default: 'h-9',
    sm: 'h-8',
  },
}
