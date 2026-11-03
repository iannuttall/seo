// The CMS publishing guides (/integrations/wordpress and the rest).
import { type Ask, type Faq, mcpUrl, type Step } from './integrations.ts'

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
  steps: Step[]
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
      'Find SEO fixes in your Search Console data with SEO Skill, then let the WordPress.com MCP rewrite titles, content and drafts. Setup for Claude, ChatGPT and Claude Code.',
    lead: 'SEO Skill tells your agent which posts need work, from your own Search Console. The WordPress MCP lets it make the change. Together they close the loop without copy and paste.',
    mcp: 'WordPress.com MCP server',
    steps: [
      {
        text: 'Add SEO Skill to your agent and sign in with Google. In Claude Code:',
        code: `claude mcp add --transport http --scope user seoskill ${mcpUrl}`,
      },
      {
        text: 'Turn on MCP access in your WordPress.com account under Preferences, then AI and MCP. Self-hosted sites connect through Jetpack.',
      },
      {
        text: 'Add the WordPress.com MCP server to the same agent and sign in to WordPress.com:',
        code: 'claude mcp add --transport http wpcom-mcp https://public-api.wordpress.com/wpcom/v2/mcp/v1',
      },
      {
        text: 'In Claude or ChatGPT on the web, add the WordPress.com connector or plugin from its directory instead, and choose Full access to let it edit.',
      },
    ],
    needs:
      'A WordPress.com site, on any plan including free, or a self-hosted site connected through Jetpack (no Jetpack plan needed), per WordPress.com. Developers can also run the official MCP Adapter plugin on a self-hosted site.',
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
      "WordPress.com lists no tool for a single post's SEO title or meta description. With Yoast SEO, its Abilities can read those fields, but its update Ability covers canonical URLs, cornerstone content and robots settings. An update with status publish goes live at once, so ask for drafts.",
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
          'Yes, through Jetpack with no paid plan, per WordPress.com. Developers can also install the WordPress MCP Adapter, which serves the abilities that plugins register.',
      },
    ],
    checked: '2026-11-03',
    sources: [
      {
        fact: 'Server URL, Claude Code setup',
        url: 'https://developer.wordpress.com/docs/mcp',
      },
      {
        fact: 'Tools, plans, Jetpack sites',
        url: 'https://wordpress.com/support/mcp/mcp-capabilities/',
      },
      {
        fact: 'Enable MCP, read and write tools',
        url: 'https://wordpress.com/support/mcp',
      },
      {
        fact: 'Yoast SEO Abilities',
        url: 'https://yoast.com/help/how-to-setup-yoast-seo-abilities',
      },
      { fact: 'MCP Adapter', url: 'https://github.com/WordPress/mcp-adapter' },
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    title: 'Shopify MCP for SEO fixes',
    metaTitle: 'Shopify MCP for SEO, with Search Console data',
    description:
      'Find SEO fixes for your Shopify store in Search Console with SEO Skill, then let the official Shopify connector update product and collection copy. Setup for Claude and ChatGPT.',
    lead: 'SEO Skill shows your agent which product and collection pages are close to page one, from your own Search Console. The Shopify connector lets it update the copy.',
    mcp: 'Shopify connector',
    steps: [
      {
        text: 'Add SEO Skill to your agent and sign in with Google. In Claude Code:',
        code: `claude mcp add --transport http --scope user seoskill ${mcpUrl}`,
      },
      {
        text: "Install Shopify's own connector from your AI tool: the Shopify connector in Claude's directory, or the Shopify plugin in ChatGPT. Gemini, Grok, Perplexity, Muse and Microsoft Copilot have one too.",
      },
      {
        text: 'Sign in to your store and approve write access in your Shopify admin. Without it the connector can only read.',
      },
    ],
    needs:
      'A Shopify store you own, on any Shopify plan. Shopify charges nothing extra for the connector, and your AI tool bills its own subscription.',
    canChange: [
      {
        title: 'Product titles and descriptions',
        text: "Update a product's title, description, status and images, one product at a time.",
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
      'Find SEO fixes in your Search Console data with SEO Skill, then let the official Webflow MCP server update page metadata and CMS items. Setup for Claude, ChatGPT and Claude Code.',
    lead: 'SEO Skill shows your agent which pages and CMS items need work, from your own Search Console. The Webflow MCP server lets it make the change in your site.',
    mcp: 'Webflow MCP server',
    steps: [
      {
        text: 'Add SEO Skill to your agent and sign in with Google. In Claude Code:',
        code: `claude mcp add --transport http --scope user seoskill ${mcpUrl}`,
      },
      {
        text: 'Add the Webflow MCP server to the same agent:',
        code: 'claude mcp add --transport http webflow https://mcp.webflow.com/mcp',
      },
      {
        text: 'Sign in to Webflow and pick the sites to authorize. In Claude and other clients with a Webflow connector, install that instead.',
      },
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
