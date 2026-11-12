import type { PairPage } from '../integration-pairs'

// google-search-console in each AI client. See integration-pairs.ts.
export const pairs: Record<string, PairPage> = {
  'google-search-console/codex': {
    description:
      'Connect Google Search Console to Codex with a hosted MCP server. Codex reads your clicks and queries, then edits the pages in your repo.',
    lead: 'Codex already works in your site’s code. Connect Google Search Console and it can see which pages earn clicks and which ones slip, then change the titles, links and copy in the same session.',
    asks: [
      {
        question:
          'Find pages in positions 4 to 10 with a low CTR and draft new titles',
        answer:
          'The quick wins section with each query and page. Codex finds the template or file for each page and proposes new titles for you to review.',
      },
      {
        question:
          'Which pages lost clicks since last month, and what changed in their code?',
        answer:
          'Content decay rows from Search Console. Codex can then read the Git history of those files and tell you what shipped around the same dates.',
      },
      {
        question: 'Check the pages from this release once they are live',
        answer:
          'A live page check and URL Inspection for each URL: status, canonical, robots and whether Google has indexed it.',
      },
      {
        question: 'Are any of our pages competing for the same query?',
        answer:
          'The cannibalization section, with the share of impressions each page gets. Codex can open both pages and suggest which one should own the query.',
      },
    ],
    sections: [
      {
        title: 'Go from a Search Console finding to a code change',
        paragraphs: [
          'In Codex the Search Console rows and your code sit in one session, so "these five pages rank well but get few clicks" can turn into a diff with five new titles.',
          'Review that diff the way you review any other. The data says where to look. Whether a new title is better is still your call, and Search Console will show the result a few weeks after you ship.',
        ],
      },
      {
        title: 'Add the CLI for crawls, Bing and copy checks',
        paragraphs: [
          'The hosted server reads Google data. Crawls, Bing Webmaster Tools and copy checks run on your machine with the `seo` CLI. Install it with `npm i -g seo`, then run `seo start` to sign in.',
          'Codex can then run `seo crawl` against localhost or a staging build before you merge, and `seo lint` on the copy it just wrote. Run `seo mcp install` to add the local MCP server to Codex as well.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does it work in the Codex IDE extension and desktop app?',
        answer:
          'Yes. The CLI, the IDE extension and the desktop app share one config, so the two commands at the top of this page add it to all three.',
      },
      {
        question: 'Should I use the hosted server or the local one?',
        answer:
          'Start with the hosted server, since one Google sign-in covers every client you use. Add the local one when you want Bing data or crawls of a site that is not public yet.',
      },
    ],
  },
  'google-search-console/chatgpt': {
    description:
      'Connect Google Search Console to ChatGPT as a custom MCP server. Ask about clicks, queries, pages and index status, with read-only Google access.',
    lead: 'Connect Google Search Console to ChatGPT once, then mention seoskill in any chat to ask about your clicks, queries and indexing. It reads your own Search Console on each request.',
    asks: [
      {
        question: '@seoskill what changed in search last week?',
        answer:
          'The report overview: clicks, impressions, CTR and position against the previous period, with the pages and queries that moved most.',
      },
      {
        question: 'Which of my searches look like they came from an AI agent?',
        answer:
          'The AI queries section: long, chat-shaped questions and agent prompts that showed your site in Google. It is a pattern match, because Search Console does not mark AI Mode.',
      },
      {
        question: 'Are two of my pages competing for the same query?',
        answer:
          'The cannibalization section: queries where more than one page gets impressions, with the share each page gets.',
      },
      {
        question: 'Did the latest core update hit my blog?',
        answer:
          'A before and after comparison for pages under /blog/, with the Google updates that fall in the window. If an update lines up with the drop, read what Google said it changed before you blame it.',
      },
    ],
    sections: [
      {
        title: 'How to connect Google Search Console to ChatGPT',
        paragraphs: [
          'ChatGPT calls an outside data source a custom MCP server, and you add it from Plugins with the steps at the top of this page. You sign in with Google while ChatGPT creates the plugin, and the sign-in asks for read-only access.',
          'To check it worked, type @seoskill and ask "which Search Console properties can you see?" ChatGPT lists every property your Google account can read. If one is missing, that account has no access to it in Search Console.',
        ],
      },
      {
        title: 'Keep a site’s questions in a ChatGPT project',
        paragraphs: [
          'Put the site in a ChatGPT project and add a line to its instructions, such as "Our Search Console property is sc-domain:example.com." Then a question like "what dropped this week?" needs no site name.',
          'ChatGPT does not remember your numbers between chats. Each request reads Search Console again, so the answer uses the latest final days.',
        ],
      },
    ],
    faq: [
      {
        question: 'Why do I have to mention seoskill in the chat?',
        answer:
          'ChatGPT uses a custom MCP server when you pick it with @ in that chat. Without it, ChatGPT answers from its own knowledge and has no view of your Search Console.',
      },
      {
        question: 'Is this the same as ChatGPT search?',
        answer:
          'No. ChatGPT search looks things up on the web. This reads your own Search Console account, which only you and the people you share the property with can see.',
      },
    ],
  },
  'google-search-console/claude': {
    description:
      'Add Google Search Console to Claude as a custom connector and ask about clicks, queries and index status in a chat on the web, desktop or phone.',
    lead: 'Ask Claude why a page lost its clicks or which queries sit on page two, and it answers from your own Search Console. Add the connector once and it works on claude.ai, the desktop app and your phone.',
    asks: [
      {
        question: 'Is my new post indexed yet?',
        answer:
          'URL Inspection for that page: whether Google has indexed it, when it last crawled it and which canonical it picked.',
      },
      {
        question: 'Which blog queries are stuck on page two?',
        answer:
          'Search Console rows for pages under /blog/, by query and page. Claude picks out the ones at positions 11 to 20 and the page that ranks for each.',
      },
      {
        question: 'Which pages get seen but rarely clicked?',
        answer:
          'The low CTR section: queries where a page ranks in the top four but gets fewer clicks than your own site usually gets at that position. Their titles and descriptions are the place to start.',
      },
      {
        question: 'Make a table of our top 20 queries for the last 28 days',
        answer:
          'Raw Search Console rows by query with clicks, impressions, CTR and position. Claude lays them out as a table you can copy into a doc.',
      },
    ],
    sections: [
      {
        title: 'Check a page from your phone after you publish',
        paragraphs: [
          'You publish a post, then wonder a day later whether Google has picked it up. Open the Claude app, turn on the connector from the + menu and ask. Claude runs URL Inspection on the page and tells you what Google reports, with the last crawl date.',
          'Google decides when to crawl, so a page that is not indexed after one day is normal. If it is still missing after a couple of weeks, ask Claude why and it checks the live page for a noindex, a redirect or a canonical that points somewhere else.',
        ],
      },
      {
        title: 'Run the same monthly report in a Claude project',
        paragraphs: [
          'Most people want the same answer each month: what moved, which pages gained and which lost. Make a Claude project for the site and write the request into its instructions, such as "Run the SEO report for example.com and list the five biggest changes."',
          'Each new chat in that project starts from those instructions and reads fresh data, so the numbers are always the latest final days Search Console has. Ask follow-up questions in the same chat to dig into one page or query.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need Search Console access for the site?',
        answer:
          'Yes. Sign in with a Google account that can see the property in Search Console. Claude only reads properties that account can already see.',
      },
      {
        question: 'Can Claude submit pages for indexing?',
        answer:
          'No. The Search Console API cannot request indexing. Claude can tell you whether a page is indexed, and you request indexing in Search Console yourself.',
      },
    ],
  },
}
