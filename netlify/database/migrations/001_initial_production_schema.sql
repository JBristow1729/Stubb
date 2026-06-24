CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  identity_id text UNIQUE,
  identity_email text,
  email text,
  display_name text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT 'user' CHECK (account_type IN ('user', 'organisation')),
  organisation_name text NOT NULL DEFAULT '',
  organisation_slug text UNIQUE,
  description text NOT NULL DEFAULT '',
  banner_image text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organiser_stripe_credentials (
  organiser_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  key_hint text NOT NULL,
  encrypted_secret text NOT NULL,
  encryption_key_version text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organisation_name text NOT NULL,
  organisation_slug text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  cover_image text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  max_tickets integer NOT NULL CHECK (max_tickets > 0),
  ticket_price_pence integer NOT NULL CHECK (ticket_price_pence >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_slug, slug)
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  stripe_session_id text UNIQUE,
  quantity integer NOT NULL CHECK (quantity > 0),
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  amount_total_pence integer NOT NULL CHECK (amount_total_pence >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id text NOT NULL REFERENCES checkout_orders(id) ON DELETE RESTRICT,
  event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_code text NOT NULL UNIQUE,
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'cancelled', 'refunded')),
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_public_lookup_idx ON events (status, event_date, organisation_slug, slug);
CREATE INDEX IF NOT EXISTS checkout_orders_session_idx ON checkout_orders (stripe_session_id);
CREATE INDEX IF NOT EXISTS tickets_event_idx ON tickets (event_id);
CREATE INDEX IF NOT EXISTS tickets_buyer_idx ON tickets (buyer_email);
