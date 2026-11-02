-- A paid weekly audit: one row per person who started paying, written only
-- from Stripe's signed webhook (src/billing.ts). customer and subscription
-- are Stripe ids; status is the subscription's Stripe status; sites is the
-- quantity paid for, which is how many sites the weekly audit runs. No card
-- details, address or invoice are kept here; Stripe holds them.

CREATE TABLE billing (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer TEXT NOT NULL,
  subscription TEXT,
  status TEXT,
  sites INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX billing_customer ON billing(customer);
