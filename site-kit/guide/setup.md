# Step 1 of 10: setup

Goal: the person has every account the site needs, signed in on this
machine, and knows what each one costs.

Work through this with the person one account at a time. For each one, say
where to click, what it costs and what to paste back. Logins that open a
browser come before API keys. Never ask for a password, and never ask the
person to paste a key into the chat. Keys go into the tool that uses them.

## Check the machine

Check for Node.js 22.12 or newer, pnpm and git, and install what is
missing. Then install `seo`:

```sh
node --version
pnpm --version || npm i -g pnpm
git --version
npm i -g seo
```

## Sign in to each account, in this order

| Order | Account | How | Cost |
| --- | --- | --- | --- |
| 1 | GitHub | `gh auth login`, then choose the browser login | Free |
| 2 | Cloudflare | `npx wrangler login` | The free plan is enough |
| 3 | Domain | Buy it later, in the plan step, on Cloudflare Registrar | About $10 a year |
| 4 | Google Search Console | After the domain exists, add a Domain property and verify it through Cloudflare | Free |
| 5 | Bing Webmaster Tools | Import the site from Search Console | Free |
| 6 | SEO Skill | `seo start` signs in with Google and adds the MCP server and skill | Free |
| 7 | Keyword data (optional) | A DataForSEO or Ahrefs key, saved on the account page at https://seoskill.dev/account, then `seo login` | Free without a key, the provider bills you with one |
| 8 | Analytics | Clicky, on the production site only | Free tier |

Accounts 3 to 5 need the domain, so they wait until the plan is approved.
Note each one as a to-do for the launch step.

## Keyword data is the person's choice

Without a key, the market and plan steps use free sources: the live search
results, autocomplete, forums and, once the site is live, its own Search
Console data. With a DataForSEO or Ahrefs key, `seo research` adds search
volumes, difficulty, the pages that rank and competitor keywords. Explain
both, give the price page of each provider, and let the person choose.
DataForSEO bills per request. Ahrefs needs a plan that includes API units.

## Rules

- One account at a time. Wait for the person to finish before the next.
- If a login fails, read the error to them in plain words and try once more
  before moving on.
- Write what was set up in the project notes, never the keys themselves.

Done when: `gh auth status`, `npx wrangler whoami` and `seo doctor` all
show a signed-in account, and the person has chosen free or paid keyword
data.

Next: `seo site guide market`
