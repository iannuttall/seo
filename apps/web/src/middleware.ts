import { agentMarkdownMiddleware } from '@iannuttall/seo-graph-astro'

// In production every page has a prebuilt static `.md` twin, so this
// middleware never runs there. It exists for the dev server, where the build
// integration has not written those files yet: a `.md` request renders the
// HTML route and converts it live, so local behavior matches production.
export const onRequest = agentMarkdownMiddleware()
