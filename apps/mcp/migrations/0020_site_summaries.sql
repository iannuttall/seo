-- The weekly summary is one email per site, like Google Search Console's
-- per-property email, so the record of what was sent moves from one row
-- per account and week to one row per site and week. week is the Monday
-- that starts the week it covers, or "first" for a site's first report.
-- Rows older than 90 days are removed, except "first".

CREATE TABLE site_summaries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  week TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, property, week)
);

-- Each site an account audits now already had what the account was sent,
-- so no site gets a second first report or this week's summary again.
INSERT INTO site_summaries (user_id, property, week, sent_at)
SELECT w.user_id, s.property, w.week, w.sent_at
FROM weekly_summaries w JOIN audit_sites s ON s.user_id = w.user_id;

-- Dropped in the same step, so the worker still running until the deploy
-- finishes cannot send an all-sites summary as well.
DROP TABLE weekly_summaries;
