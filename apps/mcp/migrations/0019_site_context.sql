-- Each account's business context for a site (seo_next): what the business
-- sells, who buys it, its money pages and competitors, as the person's agent
-- wrote it, at most 8,000 characters (packages/core/src/commands/context.ts).
-- One row per account and property, kept for every account because the
-- person wrote it, not Search Console data. Deleted with the account.

CREATE TABLE site_context (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, property)
);
