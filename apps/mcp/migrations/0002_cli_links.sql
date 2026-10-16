-- Machines a person linked with `seo login`, so the CLI there can use their
-- linked accounts and keys. A row with no user_id is a login waiting for the
-- person to approve it; it expires after ten minutes. code is what the person
-- sees, and is cleared once the CLI has its token.

CREATE TABLE cli_links (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  code TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX cli_links_user ON cli_links(user_id);
