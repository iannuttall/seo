-- Each account's issues list for a site (seo_report section "issues"): the
-- issues SEO Skill found, what the latest check saw and what the person
-- marked them (open, fixed, ignored). One JSON list per account and
-- property, at most 500 issues (packages/core/src/commands/issues.ts).
-- Deleted with the account.

CREATE TABLE site_issues (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  issues TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, property)
);
