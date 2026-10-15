-- The only data the hosted MCP keeps: who a person is, the Google and Bing
-- accounts they linked, and their research keys. Tokens and keys are sealed
-- with SEAL_KEY. No report data, rows, sites or logs.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- One row per linked Google or Bing account. subject is the provider's own
-- account id (Google "sub"); a Google account belongs to one person only.
CREATE TABLE accounts (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  refresh TEXT NOT NULL,
  access TEXT,
  access_exp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX accounts_user ON accounts(user_id);

-- Research keys by request header name, such as x-ahrefs-key.
CREATE TABLE keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);
