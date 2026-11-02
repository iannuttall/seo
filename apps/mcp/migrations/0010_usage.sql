-- Metered use by each account, one row per account, kind and UTC day, so
-- any billing period can be summed. The kind names its unit:
--   browser_run_ms     Browser Run time Cloudflare reported (weekly audit)
--   browser_run_pages  pages sent to Browser Run (weekly audit)
--   url_inspections    Google URL Inspection checks made for the account
--   research_dataforseo_calls, research_ahrefs_calls
--                      seo_research calls that returned, on the person's key
-- Metering only; nothing reads it to limit or charge an account yet.

CREATE TABLE usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, kind)
);
