CREATE TABLE IF NOT EXISTS organiser_stripe_accounts (
  organiser_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  livemode boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checkout_orders
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

CREATE INDEX IF NOT EXISTS organiser_stripe_accounts_account_idx
  ON organiser_stripe_accounts (stripe_account_id);

DROP TABLE IF EXISTS organiser_stripe_credentials;
