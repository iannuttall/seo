-- The weekly summary sent to each account, by the Monday that starts the
-- week it covers, so the Monday cron sends each account each week once.
-- Rows older than 90 days are removed.

CREATE TABLE weekly_summaries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week)
);
