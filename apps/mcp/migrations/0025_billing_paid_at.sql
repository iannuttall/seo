-- When a paid weekly audit first became active, so the weekly sign-up
-- message can count new paid audits by where the person came from
-- (src/signup-report.ts). Written once by Stripe's webhook and never moved.
-- Plans active before this column get 0: their first day is unknown, and
-- they must not count as new.

ALTER TABLE billing ADD COLUMN paid_at INTEGER;
UPDATE billing SET paid_at = 0
  WHERE status IN ('active', 'trialing', 'past_due');
