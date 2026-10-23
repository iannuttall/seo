-- What a site's index monitoring is doing now, for the account page's Sites
-- tab, so the page never wakes the site object. The object pushes it after
-- each run of its background checks. JSON: {at, used, perDay, known,
-- covered, queued, lastCheckedAt, oldestCheckedAt, dropped, returned}.

ALTER TABLE audit_sites ADD COLUMN monitor TEXT;
