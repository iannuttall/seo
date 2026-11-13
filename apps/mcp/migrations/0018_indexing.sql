-- seo submit on the hosted MCP. indexmysite is a person's Index My Site
-- connection, made with OAuth from the account page (src/indexmysite.ts):
-- the refresh token and the current access token, both sealed with
-- SEAL_KEY. indexnow_keys are the IndexNow keys seo submit made, by host;
-- a key is public once the site serves it, so it is kept as is.

CREATE TABLE indexmysite (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh TEXT NOT NULL,
  access TEXT,
  access_exp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE indexnow_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  key TEXT NOT NULL,
  PRIMARY KEY (user_id, host)
);
