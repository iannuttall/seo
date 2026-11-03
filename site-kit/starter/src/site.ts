import config from '../site.config.json'

export const site = {
  ...config,
  url: `https://${config.domain}`,
  footerNote:
    'Facts from public records, each with its source and the date it was checked.',
}

// The header and footer links. Every page they name must exist.
export const nav = [
  { label: 'All parks', href: '/' },
  { label: 'About the data', href: '/about' },
]

export const footerLinks = [
  { label: 'Home', href: '/' },
  { label: 'About the data', href: '/about' },
]

// The title tag adds the site name only when the whole title still fits.
export function pageTitle(title: string): string {
  const full = `${title} | ${site.name}`
  return title === site.name || full.length > 60 ? title : full
}

export function absoluteUrl(path: string): string {
  return new URL(path, site.url).toString()
}
