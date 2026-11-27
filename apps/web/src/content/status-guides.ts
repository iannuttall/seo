import {
  Alert02Icon,
  Clock01Icon,
  Copy01Icon,
  FileNotFoundIcon,
  GitCompareIcon,
  HierarchyIcon,
  Route01Icon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons'

// One page for each Search Console Page indexing reason, on the guides
// index and at the end of each status page. The crawled and discovered
// pages live under /features.
export const statusGuides = [
  {
    path: '/guides/alternate-page-with-proper-canonical-tag',
    title: 'Alternate page with proper canonical tag',
    text: 'A URL names another page as its canonical and Google indexed that one.',
    icon: GitCompareIcon,
  },
  {
    path: '/guides/duplicate-without-user-selected-canonical',
    title: 'Duplicate without user-selected canonical',
    text: 'Google found copies of a page with no canonical tag and picked one itself.',
    icon: Copy01Icon,
  },
  {
    path: '/guides/page-with-redirect',
    title: 'Page with redirect',
    text: 'A URL redirects, so Google indexes where it ends instead.',
    icon: Route01Icon,
  },
  {
    path: '/guides/excluded-by-noindex-tag',
    title: "Excluded by 'noindex' tag",
    text: 'The page or its server told Google not to index it.',
    icon: ViewOffIcon,
  },
  {
    path: '/guides/soft-404',
    title: 'Soft 404',
    text: 'A page answers 200 but reads like an error or an empty page to Google.',
    icon: FileNotFoundIcon,
  },
  {
    path: '/guides/sitemap-could-not-be-read',
    title: 'Sitemap could not be read',
    text: 'Google could not fetch or parse a sitemap you submitted.',
    icon: HierarchyIcon,
  },
  {
    path: '/features/crawled-currently-not-indexed',
    title: 'Crawled, currently not indexed',
    text: 'Google fetched the page and chose to leave it out.',
    icon: Alert02Icon,
  },
  {
    path: '/features/discovered-currently-not-indexed',
    title: 'Discovered, currently not indexed',
    text: 'Google knows the URL and has not crawled it yet.',
    icon: Clock01Icon,
  },
]
