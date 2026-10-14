import { escapeHtml, KEY_FIELDS } from './oauth.ts'
import { page } from './page.ts'

// How to give the MCP a provider key. The server never stores keys.
export function keysPage(env: Env): Response {
  const url = escapeHtml(`${env.PUBLIC_URL}/mcp`)
  const rows = KEY_FIELDS.map(
    (field) =>
      `<tr><td>${escapeHtml(field.label)}</td><td><code>${escapeHtml(field.header)}</code></td></tr>`,
  ).join('')
  return page(
    'API keys for SEO Skill',
    `<h1>API keys</h1>
<p>Keyword, competitor and extra analytics data use your own DataForSEO, Ahrefs, Clicky, Fathom, Simple Analytics or Plausible account. SEO Skill never stores a key.</p>
<h2>On the sign-in page</h2>
<p>Remove the SEO Skill server from your agent and add it again with <code>${url}</code>. On the sign-in page, open <strong>Add your own API keys</strong>, enter the keys, then continue with Google. The keys are sealed into the sign-in your agent keeps. This works in every client.</p>
<h2>As headers</h2>
<p>Clients such as Claude Code, Codex, Cursor and VS Code can send headers. A header wins over a key from the sign-in page.</p>
<pre><code>claude mcp add --transport http seoskill ${url} \\
  --header "x-ahrefs-key: $AHREFS_API_KEY"</code></pre>
<table><thead><tr><th>Key</th><th>Header</th></tr></thead><tbody>${rows}</tbody></table>
<p class="small">Keep keys in your shell environment or keychain, never in a chat or a repository file.</p>`,
  )
}
