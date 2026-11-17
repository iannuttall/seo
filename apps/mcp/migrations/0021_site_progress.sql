-- Each account's weekly progress points for a site (seo_report section
-- progress, packages/core/src/commands/progress.ts): Search Console totals,
-- weekly clicks, conversion pages and tracked searches, measured the way the
-- business context said that week. One per account, property and week
-- (the Monday), saved the first time seo_next or seo_report runs for the
-- site that week; the first is the baseline. Kept for every site, audited
-- or not, because Search Console drops days after 16 months. Deleted with
-- the account.

CREATE TABLE site_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  week TEXT NOT NULL,
  -- JSON: ProgressPoint.
  point TEXT NOT NULL,
  PRIMARY KEY (user_id, property, week)
);

-- Each check of a site's tracked searches in Google or its AI questions,
-- for the site and its competitors, kept when seo_research runs serp or
-- ai_answers for it. At most 260 of each kind per site. A check whose AI
-- answers were still queued is replaced once they are read back.

CREATE TABLE progress_runs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  id TEXT NOT NULL,
  ran_at TEXT NOT NULL,
  -- JSON: ProgressRun.
  run TEXT NOT NULL,
  PRIMARY KEY (user_id, property, id)
);
