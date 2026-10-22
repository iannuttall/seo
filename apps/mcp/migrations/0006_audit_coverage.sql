-- How many URLs a day Search Console can check for an audited site, and the
-- folders worth adding as their own URL-prefix properties. The site object
-- pushes this once a day, so the account page never wakes it. JSON:
-- {perDay, properties: [{property, urls}], suggestions: [{property, urls, gain}]}.

ALTER TABLE audit_sites ADD COLUMN coverage TEXT;
