import {
  Linkedin01Icon,
  NewTwitterIcon,
  YoutubeIcon,
} from '@hugeicons/core-free-icons'
import { founder, shortCount } from './site'

/**
 * Ian's audience, biggest first, for the founder card and the About page.
 * `key` names the count in /api/founder, which the page swaps in after load
 * (founder-counts.ts) on any element with `data-founder-count={key}`.
 */
export const founderSocials = [
  {
    key: 'x',
    name: 'X',
    icon: NewTwitterIcon,
    url: founder.x.url,
    count: founder.x.followers,
    unit: 'followers',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    icon: YoutubeIcon,
    url: founder.youtube.url,
    count: founder.youtube.subscribers,
    unit: 'subscribers',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin01Icon,
    url: founder.linkedin.url,
    count: founder.linkedin.followers,
    unit: 'followers',
  },
].flatMap((item) =>
  item.count ? [{ ...item, value: shortCount(item.count) }] : [],
)
