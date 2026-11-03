-- The competitors a site's weekly audit compares it with, for the account
-- page and the site object (audit/competitors.ts). JSON list of bare
-- domains. competitors_chosen is 1 once the person saved their own list;
-- until then the site object fills in the competitors DataForSEO suggests.
-- opportunities is the latest check's result, pushed by the site object
-- (GapResult in audit/competitors.ts), so the weekly summary never wakes it.
--
-- New usage kind (migrations/0010_usage.sql):
--   included_dataforseo_microusd
--                      DataForSEO spend on SEO Skill's own account for the
--                      weekly audit's competitor check, in millionths of a
--                      US dollar, as DataForSEO reported it

ALTER TABLE audit_sites ADD COLUMN competitors TEXT;
ALTER TABLE audit_sites ADD COLUMN competitors_chosen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_sites ADD COLUMN opportunities TEXT;
