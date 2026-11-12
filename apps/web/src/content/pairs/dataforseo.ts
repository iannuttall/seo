import type { PairPage } from '../integration-pairs'

// DataForSEO in each AI client. See integration-pairs.ts.
export const pairs: Record<string, PairPage> = {
  'dataforseo/claude': {
    description:
      'Use your DataForSEO account in Claude as a custom connector. Plan content in a chat with search volume, SERPs, competitors and AI answer checks.',
    lead: 'Plan your next articles in a Claude chat with real search volume, the pages that rank and the sites you compete with. Claude reads them from your own DataForSEO account, on the web, the desktop app or your phone.',
    asks: [
      {
        question: 'Find keyword ideas around "standing desk" with their volume',
        answer:
          'Keyword ideas for up to five seed terms: the searches that contain each one, sorted by volume.',
      },
      {
        question: 'Should "standing desk" and "sit stand desk" share one page?',
        answer:
          'A SERP overlap check: how many of the top 10 pages the two searches share. When most of the pages are the same, one page can usually serve both searches.',
      },
      {
        question: 'Write a brief for "best standing desk" from what ranks now',
        answer:
          'The SERP for that keyword with each ranking page and its domain authority. Claude writes the brief from those pages, so open a few of them before you trust it.',
      },
      {
        question: 'Do ChatGPT and Google AI Mode mention my site?',
        answer:
          'Your top chat-style questions from Search Console, asked in ChatGPT search, Google AI Mode and AI Overviews. A run costs about 7 cents of DataForSEO credit, and Claude is asked to tell you before it starts.',
      },
    ],
    sections: [
      {
        title: 'Plan content in a Claude chat',
        paragraphs: [
          'A content plan usually starts with a list of ideas and a lot of tab switching. In a Claude chat you can ask for the ideas, check their volume, look at who ranks and decide which ones get their own page, all in one place.',
          'Claude only sees what the research returns. Volume and difficulty are DataForSEO’s estimates, kept apart from your Search Console clicks, so use them to compare keywords with each other.',
        ],
      },
      {
        title: 'Add your DataForSEO login once',
        paragraphs: [
          'Claude connectors cannot send your DataForSEO login with each request, so save it under Keys on your account page at seoskill.dev/account. It is stored encrypted and works in every client you connect.',
          'Each result says what it cost from DataForSEO’s own numbers. The AI answer check is the one to watch, at about 7 cents a run.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need a skill to use DataForSEO in Claude?',
        answer:
          'No. In claude.ai and the Claude apps the connector is all you add. The SEO skill is for coding agents such as Claude Code, where it tells the agent which report to run.',
      },
      {
        question: 'Does it work in the Claude mobile app?',
        answer:
          'Yes. The connector belongs to your Claude account, so once you add it on claude.ai or the desktop app it shows up in the iPhone and Android apps too.',
      },
    ],
  },
}
