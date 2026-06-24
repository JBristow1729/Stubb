# Stubb Production Roadmap

This is the build order for taking Stubb from static design prototype to production app.

## 1. Server State

Use Netlify Database as the system of record. The migrations in `netlify/database/migrations/` create:

- `profiles` for Wholegrain-linked buyer and organiser accounts.
- `organiser_stripe_accounts` for Stripe Connect account IDs and onboarding status.
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

## 2. Stripe Connect

Use Stripe Connect. Do not ask organisers to paste Stripe secret keys into Stubb.

Stubb is the Connect platform:

- organisers connect their own Stripe account through OAuth,
- Stubb stores their `stripe_account_id`,
- Checkout Sessions are created as direct charges on the connected account,
- ticket money goes to the organiser's Stripe account,
- Stubb uses one Connect webhook endpoint to verify payment events and issue tickets.

Backend functions:

- `/.netlify/functions/stripe-connect-start`
- `/.netlify/functions/stripe-connect-callback`
- `/.netlify/functions/stripe-connect-status`

## 3. Stripe Checkout

`/.netlify/functions/create-checkout-session` now:

- validates the event from the database,
- checks ticket availability,
- creates a local `checkout_orders` row,
- creates a connected-account Stripe Checkout Session without the Stripe SDK,
- stores the Stripe session ID against the order.

The browser should eventually call this function instead of issuing local tickets. Until the database is
enabled and events are written server-side, the current local-first UI remains useful for design testing.

## 4. Stripe Webhook

`/.netlify/functions/stripe-webhook` now:

- uses the unmodified raw request body,
- verifies `Stripe-Signature` with `STRIPE_CONNECT_WEBHOOK_SECRET`,
- records processed Stripe event IDs to avoid duplicate ticket issue,
- creates tickets only after `checkout.session.completed`.

Required environment variable:

```text
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

## 5. Authentication

The Wholegrain account-link callback already exists, but production still needs a server-side session/token
contract so browser requests cannot impersonate another organiser. Build this before exposing Connect
actions in the account page.

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
  - `STRIPE_PLATFORM_SECRET_KEY`
  - `STRIPE_CONNECT_CLIENT_ID`
  - `STRIPE_CONNECT_WEBHOOK_SECRET`
  - `WHOLEGRAIN_LINK_SECRET`
  - `STUBB_RESTORE_SECRET`
  - `STUBB_CONNECT_STATE_SECRET`
- Stripe webhook endpoint pointing at:
  - `https://<your-domain>/.netlify/functions/stripe-webhook`
- Stripe Connect OAuth redirect pointing at:
  - `https://<your-domain>/.netlify/functions/stripe-connect-callback`

After that, the next code step is server-side profile/session auth, then event CRUD APIs.
