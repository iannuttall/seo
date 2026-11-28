-- Usage plans (src/meter.ts, src/billing.ts, src/credit.ts): $10, $50, $100
-- or $200 a month for an account, with DataForSEO usage included at cost
-- plus 30%, top-ups and a one-off free credit. The old per-site plan keeps
-- working with plan NULL until every account has moved.

-- The monthly plan in US dollars, or NULL for the old per-site plan.
ALTER TABLE billing ADD COLUMN plan INTEGER;
-- When the plan's current period ends (Stripe's current_period_end, ms):
-- the reset date of its included usage.
ALTER TABLE billing ADD COLUMN period_end INTEGER;
-- Auto-reload: the top-up in US dollars bought when top-ups run low, and
-- the most it may buy in a calendar month (UTC). NULL when off.
ALTER TABLE billing ADD COLUMN auto_reload INTEGER;
ALTER TABLE billing ADD COLUMN auto_reload_cap INTEGER;
-- The Stripe payment method auto-reload charges, from the plan's Checkout.
ALTER TABLE billing ADD COLUMN payment_method TEXT;

-- What an account has spent and has left, in micro-USD of usage (our cost
-- plus 30%). plan_used belongs to the period ending period_end and resets
-- with it; topup never expires; credit is the free credit left.
CREATE TABLE balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  period_end INTEGER,
  plan_used INTEGER NOT NULL DEFAULT 0,
  topup INTEGER NOT NULL DEFAULT 0,
  credit INTEGER NOT NULL DEFAULT 0,
  -- The highest usage notice shown this period (50, 80 or 100), so each
  -- shows once.
  notified INTEGER NOT NULL DEFAULT 0,
  -- US dollars auto-reload bought in reload_month (YYYY-MM, UTC).
  reloaded INTEGER NOT NULL DEFAULT 0,
  reload_month TEXT,
  updated_at INTEGER NOT NULL
);

-- The one-off free credit, one row per account once it signed in or had
-- its sites checked (src/credit.ts). state: pending (not decided yet),
-- granted, held_card (unlocks with a card), held_site (no site qualifies
-- yet), held_cap (over the daily cap, waiting), linked (its sites' group
-- already had the credit).
-- human is 1 when a sign-in passed Turnstile, 0 when one failed it and
-- NULL when none was checked; ip_hash is a salted hash of the latest
-- sign-in's network block, set at ip_at and cleared after 30 days.
-- checked_at is when the account's sites were last looked at, so a held
-- credit is not checked against Google on every call.
CREATE TABLE credits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  human INTEGER,
  ip_hash TEXT,
  ip_at INTEGER,
  checked_at INTEGER,
  granted_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX credits_granted ON credits(granted_at);
CREATE INDEX credits_ip_at ON credits(ip_at);

-- Salted hashes of the Search Console properties of accounts that asked
-- for the credit, so a group of accounts sharing sites gets one credit.
-- Kept after an account is deleted, so deleting and signing up again does
-- not get another. The site itself is never stored.
CREATE TABLE credit_sites (
  hash TEXT PRIMARY KEY,
  user_id TEXT,
  at INTEGER NOT NULL
);

-- Credits granted per hashed network block and ISO week (3 at most).
-- Weeks older than 30 days are removed.
CREATE TABLE credit_ips (
  ip_hash TEXT NOT NULL,
  week TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, week)
);

-- Salted hashes of Stripe card fingerprints that unlocked a held credit:
-- one credit per card.
CREATE TABLE credit_cards (
  hash TEXT PRIMARY KEY,
  user_id TEXT,
  at INTEGER NOT NULL
);

-- Paid top-ups bought through Checkout, one row per Checkout session, so
-- a top-up Stripe sends again is added once. Kept as the record of what
-- was bought.
CREATE TABLE topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  usd INTEGER NOT NULL,
  at INTEGER NOT NULL
);
