-- Beta features granted to an account. Only a maintainer writes here, with
-- scripts/beta.mjs; nothing on the account page or in the tools does. An
-- account with no row sees nothing of any beta.

CREATE TABLE beta_flags (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, flag)
);
