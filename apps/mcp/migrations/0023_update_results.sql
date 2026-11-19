-- Each account's result for a Google ranking update on a site (core
-- packages/core/src/commands/updates.ts): clicks and impressions from the
-- update's start against the days before, the verdict, brand and not
-- brand, and what moved. Kept once a result covers the whole update, from
-- seo_report section google-updates, the impact email and the Monday
-- summary; a later result for the same update replaces it. Kept for every
-- site, audited or not, because Search Console drops days after 16 months.
-- Deleted with the account.

CREATE TABLE update_results (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  update_id TEXT NOT NULL,
  update_start TEXT NOT NULL,
  -- JSON: UpdateImpact.
  result TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, property, update_id)
);
