# Stubb Production Roadmap

This is the build order for taking Stubb from static design prototype to production app.

## 1. Server State

Use Netlify Database as the system of record. The first migration is in
`netlify/database/migrations/001_initial_production_schema.sql` and creates:

- `profiles` for Wholegrain-linked buyer and organiser accounts.
- `organiser_stripe_credentials` for encrypted organiser Stripe keys.
- `events` for organiser-owned event listings.
- `checkout_orders` for pending and paid Stripe orders.
- `tickets` for issued tickets and check-in state.
- `stripe_webhook_events` for idempotent webhook processing.

Local setup stops here until Netlify Database is enabled:

```text
netlify dev
netlify database migrations apply
netlify database status
```

Netlify's current Database docs say local development runs a real Postgres-compatible database through
`netlify dev`, and production code can use the `@netlify/database` module to query the correct database
branch for the deploy context.

## 2. Secrets

Never store Stripe keys in browser storage. Stubb stores organiser Stripe keys only through
`/.netlify/functions/organiser-stripe-key`, encrypted with AES-256-GCM before writing to the database.

Required environment variable:

```text
STUBB_SECRET_KEY_ENCRYPTION_KEY=<32 random bytes encoded as base64 or base64url>
```

Generate one locally with Node:

```text
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Production still needs a real server-auth check before this endpoint is exposed in the UI. Right now the
endpoint expects an organiser account context so the database shape and encryption path can be built first.

## 3. Stripe Checkout

`/.netlify/functions/create-checkout-session` now:

- validates the event from the database,
- checks ticket availability,
- creates a local `checkout_orders` row,
- decrypts the organiser Stripe key server-side,
- creates a Stripe Checkout Session without the Stripe SDK,
- stores the Stripe session ID against the order.

The browser should eventually call this function instead of issuing local tickets. Until the database is
enabled and events are written server-side, the current local-first UI remains useful for design testing.

## 4. Stripe Webhook

`/.netlify/functions/stripe-webhook` now:

- uses the unmodified raw request body,
- verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`,
- records processed Stripe event IDs to avoid duplicate ticket issue,
- creates tickets only after `checkout.session.completed`.

Required environment variable:

```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 5. Authentication

The Wholegrain account-link callback already exists, but production still needs a server-side session/token
contract so browser requests cannot impersonate another organiser. Build this before connecting the account
page to `organiser-stripe-key`.

Recommended order:

1. Accept Wholegrain's signed link request.
2. Upsert `profiles`.
3. Mint an HTTP-only Stubb session or short-lived bearer token.
4. Require that session/token in every organiser-only function.
5. Remove any direct trust in browser-supplied organiser IDs.

## 6. Event API

Move these browser-local actions into Netlify Functions:

- create/update/publish event,
- list public events,
- list organiser events,
- create checkout order,
- fetch tickets for the signed-in buyer,
- check in tickets for the owning organiser.

Keep `localStorage` only as draft/cache state.

## 7. QR Codes

Do not add an OSS QR package by default. Build an in-house standards-compliant QR encoder in stages:

1. Generate byte-mode QR symbols for Stubb ticket URLs.
2. Add Reed-Solomon error correction.
3. Reserve finder, timing, format, and version areas correctly.
4. Add mask scoring and format bits.
5. Verify against known QR decoder fixtures before relying on camera scanning.

The logo can be added later by reserving a center area only after error-correction tests pass.

## 8. External Setup Stop Point

Before the next production-code step, create/configure these externally:

- Netlify project linked to this repo.
- Netlify Database enabled for the project.
- Netlify env vars:
  - `STUBB_SECRET_KEY_ENCRYPTION_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `WHOLEGRAIN_LINK_SECRET`
  - `STUBB_RESTORE_SECRET`
- Stripe webhook endpoint pointing at:
  - `https://<your-domain>/.netlify/functions/stripe-webhook`
- A test organiser Stripe key to save through the encrypted endpoint.

After that, the next code step is server-side profile/session auth, then event CRUD APIs.
