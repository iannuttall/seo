// The CMS publishing guides (/integrations/wordpress and the rest).
import type { Ask, Faq } from './integrations.ts'

/**
 * A CMS whose own MCP server lets the agent make the fixes SEO Skill finds.
 * SEO Skill never writes to the site: these pages pair it with the CMS's
 * official MCP. Facts come from the vendor pages in `sources`, read on
 * `checked`.
 */
export type Cms = {
  id: string
  name: string
  title: string
  metaTitle: string
  description: string
  lead: string
  /** The vendor's MCP server or connector, by its own name. */
  mcp: string
  /** How a person adds it, in order. */
  /** What the setup prompt adds on this page, after SEO Skill's own steps. */
  setupSteps: string[]
  /** Who can use it, from the vendor's pages. */
  needs: string
  /** SEO fixes it can make. */
  canChange: { title: string; text: string }[]
  /** What it cannot change, or where results vary. */
  limit: string
  asks: Ask[]
  faq: Faq[]
  checked: string
  sources: { fact: string; url: string }[]
}

export const cmsList: Cms[] = [
  {
    id: 'wordpress',
    name: 'WordPress',
    title: 'WordPress MCP for SEO fixes',
    metaTitle: 'WordPress MCP for SEO, with Search Console data',
    description:
      'Find SEO fixes in your Search Console data with SEO Skill, then let the WordPress.com MCP rewrite titles, content and drafts.',
    lead: 'SEO Skill tells your agent which posts need work, from your own Search Console. The WordPress MCP lets it make the change. Together they close the loop without copy and paste.',
    mcp: 'WordPress.com MCP server',
    setupSteps: [
      'If my site is self-hosted, check with me that it runs Jetpack, connected to WordPress.com, on a Jetpack plan that includes Jetpack AI. Without that plan, stop and tell me the free route is the MCP Adapter plugin from WordPress.org.',
      'Add the WordPress.com MCP server, https://public-api.wordpress.com/wpcom/v2/mcp/v1, next to seoskill, and wait while I sign in to WordPress.com and choose Full access. If you cannot add servers yourself, such as in Claude or ChatGPT on the web, tell me to add the WordPress.com connector from its directory instead.',
      'Save every WordPress change as a draft for me to read, unless I say otherwise.',
    ],
    needs:
      'A WordPress.com site, on any plan including free. A self-hosted site connects through Jetpack, on a Jetpack plan that includes Jetpack AI. Without one, the free route is the official MCP Adapter plugin.',
    canChange: [
      {
        title: 'Post and page titles and content',
        text: 'Create, read, update and delete posts and pages. New posts start as drafts.',
      },
      {
        title: 'One section at a time',
        text: 'Change a single block of a post in place, so a weak introduction gets rewritten without touching the rest.',
      },
      {
        title: 'Categories, tags and custom post types',
        text: 'Including WooCommerce products and types added by themes or plugins.',
      },
      {
        title: 'The homepage meta description',
        text: 'On Premium, Business and Commerce plans, and only while no other SEO plugin is active.',
      },
    ],
    limit:
      "WordPress.com lists no tool for a single post's SEO title or meta description. With Yoast SEO, its Abilities can read those fields, but its update Ability covers canonical URLs, key content flags and robots settings. An update with status publish goes live at once, so ask for drafts.",
    asks: [
      {
        question:
          'Which posts are on page two for a query, and rewrite their intros as drafts.',
        answer:
          'SEO Skill lists the striking distance queries and pages. The WordPress MCP saves a draft of each intro for you to review.',
      },
      {
        question:
          'Find posts with a low click-through rate and suggest new titles.',
        answer:
          'The low CTR section gives the pages and their queries. Ask for the titles first, then tell the agent which to apply.',
      },
      {
        question:
          'Which pages lost their clicks this month, and are they still indexed?',
        answer:
          'SEO Skill checks each one with URL Inspection before your agent opens the post to edit.',
      },
    ],
    faq: [
      {
        question: 'Does SEO Skill change my WordPress site?',
        answer:
          'No. SEO Skill only reads Search Console, Google Analytics and your keyword data. The WordPress.com MCP makes the edits, with the access you grant it.',
      },
      {
        question: 'Can I give the WordPress MCP read-only access?',
        answer:
          'Yes. When you connect Claude or ChatGPT, WordPress.com offers Full access or Read only, and you can turn single tools off in your MCP settings.',
      },
      {
        question: 'Does it work with self-hosted WordPress?',
        answer:
          "Yes. Through Jetpack it gets the same WordPress.com MCP tools, on a Jetpack plan that includes Jetpack AI. Without a plan, the free route is the official MCP Adapter plugin. It connects desktop and coding agents with an Application Password, not Claude or ChatGPT on the web, and it only offers the abilities your plugins make public. WordPress core's own abilities read site details and don't edit posts.",
      },
    ],
    checked: '2026-11-28',
    sources: [
      {
        fact: 'Server URL, plans, Claude Code setup',
        url: 'https://developer.wordpress.com/docs/mcp',
      },
      {
        fact: 'Tools',
        url: 'https://wordpress.com/support/mcp/mcp-capabilities/',
      },
      {
        fact: 'Jetpack sites and plans',
        url: 'https://jetpack.com/support/create-better-content-with-jetpack-ai/mcp/',
      },
      {
        fact: 'Enable MCP, read and write tools',
        url: 'https://wordpress.com/support/mcp',
      },
      {
        fact: 'Yoast SEO Abilities',
        url: 'https://yoast.com/help/how-to-setup-yoast-seo-abilities',
      },
      {
        fact: 'MCP Adapter setup',
        url: 'https://github.com/WordPress/mcp-adapter/blob/trunk/docs/getting-started/site-owners.md',
      },
      {
        fact: 'Core abilities',
        url: 'https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/',
      },
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    title: 'Shopify MCP for SEO fixes',
    metaTitle: 'Shopify MCP for SEO, with Search Console data',
    description:
      'Find SEO fixes for your Shopify store in Search Console with SEO Skill, then let the official Shopify connector update product and collection copy.',
    lead: 'SEO Skill shows your agent which product and collection pages are close to page one, from your own Search Console. The Shopify connector lets it update the copy.',
    mcp: 'Shopify connector',
    setupSteps: [
      "Tell me to install Shopify's own connector in this AI tool, such as the Shopify connector in Claude's directory or the Shopify plugin in ChatGPT, and to approve write access in my Shopify admin. Without write access it can only read. Wait until I say it is done.",
      'Show me each product or collection change before you save it.',
    ],
    needs:
      'A Shopify store you own, on any Shopify plan. Shopify charges nothing extra for the connector, and your AI tool bills its own subscription.',
    canChange: [
      {
        title: 'Product titles and descriptions',
        text: 'Update one product at a time, including its title, description, status and images.',
      },
      {
        title: 'Collection titles and descriptions',
        text: "Update a collection's title, description, image and rules, or create a new collection page.",
      },
      {
        title: 'Pages, blogs and metafields',
        text: 'Through the Shopify Admin API, with a confirmation before each change. Shopify says results vary more here, so check them in your admin.',
      },
      {
        title: 'Theme edits on a copy',
        text: 'It edits an unpublished copy of your theme, never the live one, and you publish it.',
      },
    ],
    limit:
      'The connector changes items one at a time, so a large batch can stop partway. SEO titles and meta descriptions have no named action and go through the Admin API route. It cannot touch payments, refunds or store settings.',
    asks: [
      {
        question:
          'Which collection pages rank on page two, and rewrite their descriptions.',
        answer:
          'SEO Skill lists the queries and pages close to page one. The connector updates each collection description after you agree.',
      },
      {
        question: 'Which products get impressions but almost no clicks?',
        answer:
          'The low CTR section gives the product URLs and their queries, so the agent can suggest better titles.',
      },
      {
        question: 'Did our new collection pages get indexed?',
        answer:
          'SEO Skill checks each URL with URL Inspection and reports what Google says.',
      },
    ],
    faq: [
      {
        question: 'Does SEO Skill change my Shopify store?',
        answer:
          'No. SEO Skill only reads Search Console, Google Analytics and your keyword data. The Shopify connector makes the edits, with the access you approve.',
      },
      {
        question: 'Can the Shopify connector change prices or refund orders?',
        answer:
          'It can change variant prices when you allow writes. Shopify blocks refunds, cancellations, returns and gift card changes even with write access.',
      },
      {
        question: 'Is the Shopify Dev MCP the same thing?',
        answer:
          'No. The Dev MCP gives coding agents Shopify docs and API schemas and never touches a store. Use the connector for store edits.',
      },
    ],
    checked: '2026-11-03',
    sources: [
      {
        fact: 'Connector actions, limits, install',
        url: 'https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/shopify-connector-for-claude',
      },
      {
        fact: 'Supported AI tools',
        url: 'https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools',
      },
      {
        fact: 'Dev MCP and AI Toolkit',
        url: 'https://shopify.dev/docs/apps/build/ai-toolkit',
      },
    ],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    title: 'Webflow MCP for SEO fixes',
    metaTitle: 'Webflow MCP for SEO, with Search Console data',
    description:
      'Find SEO fixes in your Search Console data with SEO Skill, then let the official Webflow MCP server update page metadata and CMS items.',
    lead: 'SEO Skill shows your agent which pages and CMS items need work, from your own Search Console. The Webflow MCP server lets it make the change in your site.',
    mcp: 'Webflow MCP server',
    setupSteps: [
      'Add the Webflow MCP server, https://mcp.webflow.com/mcp, next to seoskill, and wait while I sign in to Webflow and pick the sites to authorize. If this client has a Webflow connector, such as Claude, tell me to install that instead.',
      'Show me each metadata or CMS item change before you publish it.',
    ],
    needs:
      "A Webflow site on any Site plan, including the free Starter plan. Every site role except Reviewer can connect, and the server keeps your role's permissions.",
    canChange: [
      {
        title: 'Meta titles, descriptions and Open Graph tags',
        text: 'Update them across pages, along with page settings and schema markup, with no need to open Webflow.',
      },
      {
        title: 'CMS items',
        text: 'Create, read, update and delete items in your collections, such as blog posts.',
      },
      {
        title: 'Elements on the canvas',
        text: 'Edit text, headings and attributes through the Designer API, with the Webflow MCP Bridge App open in the Designer.',
      },
      {
        title: 'Secondary locales',
        text: 'Read and update existing localized content. It cannot create new localized CMS items.',
      },
    ],
    limit:
      'Each authorization covers one Workspace, and not every Webflow API is available as a tool. Designer changes need the Designer open in your browser.',
    asks: [
      {
        question:
          'Which blog posts lost the most clicks, and refresh the weakest one.',
        answer:
          'SEO Skill finds the decaying pages from Search Console. The Webflow MCP updates the CMS item as you direct.',
      },
      {
        question:
          'Find pages with a low click-through rate and rewrite their meta descriptions.',
        answer:
          'The low CTR section gives the pages and their queries for the agent to work from.',
      },
      {
        question: 'Are all our CMS template pages indexed?',
        answer:
          'SEO Skill checks the URLs with URL Inspection and says which ones Google has not indexed.',
      },
    ],
    faq: [
      {
        question: 'Does SEO Skill change my Webflow site?',
        answer:
          'No. SEO Skill only reads Search Console, Google Analytics and your keyword data. The Webflow MCP server makes the edits, within your Webflow role.',
      },
      {
        question: 'Do I need a paid Webflow plan?',
        answer:
          'No. Webflow says its MCP server works on all Site plans, including the free Starter plan.',
      },
      {
        question: 'Does Webflow need to be open?',
        answer:
          'Only for Designer changes on the canvas. Page metadata and CMS items work without it.',
      },
    ],
    checked: '2026-11-03',
    sources: [
      {
        fact: 'Plans, roles, what it does',
        url: 'https://help.webflow.com/hc/en-us/articles/52536562285203-Webflow-MCP-server-overview',
      },
      {
        fact: 'Server URL, connecting',
        url: 'https://help.webflow.com/hc/en-us/articles/52536616701971-Connect-your-AI-tools-to-the-Webflow-MCP-server',
      },
      {
        fact: 'Tools, limits, Bridge App',
        url: 'https://developers.webflow.com/mcp/reference/overview',
      },
    ],
  },
]

export const cmsPaths = cmsList.map((cms) => `/integrations/${cms.id}`)
