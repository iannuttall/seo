-- A paid weekly audit: one row per person who opened Stripe Checkout or
-- pays (src/billing.ts). customer and subscription are Stripe ids, written
-- from Stripe's signed webhook; status is the subscription's Stripe status;
-- sites is the quantity paid for, which is how many sites the weekly audit
-- runs. checkout is the person's one open Checkout session, so an older
-- link is expired before a new one is made and nobody pays twice. No card
-- details, address or invoice are kept here; Stripe holds them.

CREATE TABLE billing (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer TEXT,
  subscription TEXT,
  status TEXT,
  sites INTEGER NOT NULL DEFAULT 0,
  checkout TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX billing_customer ON billing(customer);
