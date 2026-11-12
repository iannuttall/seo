import type { PairPage } from '../integration-pairs'

// google-analytics in each AI client. See integration-pairs.ts.
export const pairs: Record<string, PairPage> = {
  'google-analytics/codex': {
    description:
      'Connect Google Analytics to Codex with a hosted MCP server. Codex sees sessions and key events by landing page while it works on your site.',
    lead: 'Ask Codex which landing pages bring sessions and key events from search, then let it work on those pages in your repo. It reads your Google Analytics on each request.',
    asks: [
      {
        question:
          'Sessions dropped but clicks did not. Is our tracking broken?',
        answer:
          'Search Console clicks beside sessions from search and from all channels. If clicks held and every channel fell, Codex can search your templates for the Google Analytics tag.',
      },
      {
        question:
          'Which landing pages from search have the fewest engaged sessions?',
        answer:
          'Landing pages from Organic Search with sessions, engaged sessions and key events. Codex can open the weakest ones and look at what visitors see first.',
      },
      {
        question: 'Did the redesign we shipped on 2026-10-01 change sessions?',
        answer:
          'Sessions and clicks in equal periods before and after that date.',
      },
      {
        question: 'Which pages do AI assistants send people to?',
        answer:
          'Visits from ChatGPT, Perplexity, Claude, Gemini and Copilot, by source, with the pages they land on.',
      },
    ],
    sections: [
      {
        title: 'Check tracking after a release',
        paragraphs: [
          'A release that drops the analytics tag from one template looks like a traffic drop in every dashboard. Ask Codex to compare the days before and after the release. If Search Console clicks held steady while sessions fell, the tag is the first suspect.',
          'Codex has the code open, so it can search for the tag in your layouts and show you which templates lost it.',
        ],
      },
      {
        title: 'Name the site once in AGENTS.md',
        paragraphs: [
          'Codex reads AGENTS.md at the root of your repo. Add a line such as "Our site is example.com" and Codex knows which site to ask about without you naming it each time.',
          'You still do not pick a property ID. The server finds the Google Analytics property whose web stream matches the site and names it in the answer.',
        ],
      },
    ],
    faq: [
      {
        question: 'Can Codex change my Google Analytics settings?',
        answer:
          'No. The Google sign-in asks for read-only access, so Codex can read reports and nothing more. Your Google Analytics settings stay as they are.',
      },
      {
        question: 'Does it work in the Codex IDE extension and desktop app?',
        answer:
          'Yes. The CLI, the IDE extension and the desktop app share one config, so adding the server once covers all three.',
      },
    ],
  },
  'google-analytics/chatgpt': {
    description:
      'Connect Google Analytics to ChatGPT as a custom MCP server. Ask about sessions from search, landing pages and the visits ChatGPT sends you.',
    lead: 'Add one custom MCP server to ChatGPT and ask about your Google Analytics in a chat, including how many visits ChatGPT itself sends to your site.',
    asks: [
      {
        question: 'How much traffic does ChatGPT send us?',
        answer:
          'The AI assistants rows with chatgpt.com as its own source, beside Perplexity, Claude, Gemini and Copilot, and the pages each one sends people to.',
      },
      {
        question: 'Did ChatGPT visits grow after we published the guide?',
        answer:
          'Sessions in equal periods before and after the publish date, with visits from AI assistants counted in each.',
      },
      {
        question: 'Which landing pages from search lead to sign-ups?',
        answer:
          'Landing pages from Organic Search with sessions, engaged sessions and key events. A key event is whatever you marked as one in Google Analytics, such as a sign-up.',
      },
      {
        question: 'Do clicks and sessions agree for the last 28 days?',
        answer:
          'Search Console clicks beside Organic Search sessions for the same dates. They count different things, so expect a gap.',
      },
    ],
    sections: [
      {
        title: 'See the visits ChatGPT sends you',
        paragraphs: [
          'When someone clicks a link in a ChatGPT answer, the visit usually arrives with chatgpt.com as its referrer, and the report counts it under AI assistants. The answer gives the total against the previous period and the pages those visitors land on.',
          'Some visits slip through. The ChatGPT app does not always pass a referrer, and those visits show up as Direct in Google Analytics. Treat the number as a floor (the real figure can only be higher).',
        ],
      },
      {
        title: 'What you need before you add it to ChatGPT',
        paragraphs: [
          'You need Viewer access to the Google Analytics property on the Google account you sign in with, and a ChatGPT plan that allows custom MCP servers. OpenAI lists Business, Enterprise and Edu workspaces and Pro accounts.',
          'You do not pick a property ID. Name the site and the server finds the property whose web stream matches it, then names that property in the answer.',
        ],
      },
    ],
    faq: [
      {
        question: 'Can ChatGPT change my Google Analytics?',
        answer:
          'No. The Google sign-in asks for read-only access, so ChatGPT can read reports but cannot edit properties, events or users.',
      },
      {
        question: 'Why do I have to mention seoskill in the chat?',
        answer:
          'ChatGPT uses a custom MCP server when you pick it with @ in that chat. Without it, ChatGPT has no view of your Google Analytics.',
      },
    ],
  },
  'google-analytics/claude': {
    description:
      'Add Google Analytics to Claude on the web, desktop or phone as a custom connector. Ask about search sessions, landing pages and AI referrals.',
    lead: 'Add one connector to your Claude account and ask about your Google Analytics in a normal chat, on the web, the desktop app or your phone. You don’t need a terminal or a Google Cloud project.',
    asks: [
      {
        question:
          'Write a short update on the last 28 days of search traffic for my manager',
        answer:
          'The SEO report for the last 28 days, with Organic Search sessions beside Search Console clicks. Claude writes the update from those numbers, so check the totals it quotes.',
      },
      {
        question: 'Which blog posts get visitors from search who stay?',
        answer:
          'Landing pages from Organic Search with sessions, engaged sessions and key events, so you can see which posts hold attention and which ones people leave.',
      },
      {
        question: 'How many visits does Claude send us?',
        answer:
          'The AI assistants rows count claude.ai beside ChatGPT, Perplexity, Gemini and Copilot, with the pages each one sends people to.',
      },
      {
        question: 'Chart sessions before and after our redesign',
        answer:
          'Sessions and clicks in equal periods either side of the date. Claude can draw the chart in the chat, and the numbers under it come from your property.',
      },
    ],
    sections: [
      {
        title:
          'Use Google Analytics in claude.ai, the desktop app and your phone',
        paragraphs: [
          'The Claude Code setup is a command for developers. This one is for anyone with a Claude account: a marketer checking last week’s traffic, a founder on their phone, or a writer looking at which posts people read.',
          'You add the connector once in claude.ai. It belongs to your Claude account, so the desktop app and the mobile apps pick it up with nothing more to set up. In each chat, turn it on from the + menu when you want Claude to read your numbers (and leave it off when you don’t).',
          'Claude does not pick a property ID out of a list. Name the site, and the server finds the Google Analytics property whose web stream matches it and names that property in the answer.',
        ],
      },
      {
        title: 'Keep your site in a Claude project',
        paragraphs: [
          'If you ask about the same site every week, put it in a Claude project. Add a line to the project instructions such as "Our site is example.com. Compare with the previous 28 days." and every chat in the project starts from it.',
          'Each request reads your data again, so last week’s chat does not hold stale numbers. Ask again and you get the latest days Google Analytics has.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does it work in the Claude mobile app?',
        answer:
          'Yes. Add the connector on claude.ai or in the desktop app first. It belongs to your Claude account, so it shows up in the iPhone and Android apps too.',
      },
      {
        question: 'Can Claude change my Google Analytics settings?',
        answer:
          'No. The Google sign-in asks for read-only access, so Claude can read reports but cannot edit properties, goals or users.',
      },
    ],
  },
}
