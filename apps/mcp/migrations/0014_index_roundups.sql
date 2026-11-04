-- The daily Google index roundup, by the Search Console day it went out
-- on, so the hourly cron reads each account's sites once a day. Rows older
-- than 30 days are removed.

CREATE TABLE index_roundups (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
