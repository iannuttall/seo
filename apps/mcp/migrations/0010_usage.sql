-- Metered use by each account, one row per account, kind and UTC day, so
-- any billing period can be summed. The kind names its unit:
--   browser_run_ms     Browser Run time Cloudflare reported (weekly audit)
--   browser_run_pages  pages sent to Browser Run (weekly audit)
-- Metering only; nothing reads it to limit or charge an account yet.

CREATE TABLE usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, kind)
);
