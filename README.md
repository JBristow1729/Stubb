# Stubb

Stubb is a static, local-first event ticketing app. It supports organiser accounts, event creation,
public event browsing, buyer checkout, ticket issue, ticket display, attendee management, and
check-in from a single static deploy.

The app intentionally starts with no sample data. Create an organisation account, publish an event,
then create a separate user account to buy a ticket.

## Current Functionality

- Dark mode by default, with a persistent light/dark toggle.
- Profile menu changes by authentication state.
- Login/signup redirects to the Wholegrain Studios account-link page, then returns to Stubb account setup.
- Account editing for banner image URL, organisation name, description, and Stripe notes.
- Organisation event dashboard with create, edit, preview, publish, delete, and manage flows.
- Public event discovery and organisation storefront pages.
- Event rules for sold-out and past-event purchase blocking.
- Buyer checkout with name/email capture.
- Local payment confirmation that issues paid tickets.
- Ticket page with ticket code, open-in-app URL, and in-house QR-style canvas.
- Manage event table with attendee status and manual checkbox check-in.
- Scanner modal with ticket code/payload entry and duplicate check-in warning.
- Netlify functions showing the intended Stripe Checkout and raw-body webhook signature boundary.

## Production Notes

This is a static app, so shared production state still needs real infrastructure:

- Replace `localStorage` with Netlify Database and server APIs.
- Add Stubb to the central Wholegrain Studios account-link service before production launch.
- Store platform secrets only in server-side environment variables.
- Store organiser Stripe keys only through the encrypted server-side credential endpoint.
- Create tickets only after a verified Stripe webhook.
- Send ticket emails from a transactional email provider.
- Replace the QR-style canvas with the planned in-house standards-compliant QR encoder before relying on camera scanning.

The Stripe function stubs follow Stripe's current security guidance: webhook verification must use
the unmodified raw request body plus the `Stripe-Signature` header and endpoint secret.

See `docs/production-roadmap.md` for the build order, schema, and external setup stop point.

## File Map

```text
index.html                       Public discovery
login.html                       Login/signup
account.html                     Account profile
settings.html                    Theme, version, support link
events-user.html                 Tickets bought by the current user
events-organisation.html         Events hosted by the current organisation
events-organisation-public.html  Public organisation storefront
event-editor.html                Create/edit event form
event-preview.html               Publish preview
event-page.html                  Event detail and checkout/owner actions
checkout.html                    Buyer details and payment handoff
ticket-page.html                 Issued ticket
manage-event.html                Attendee management and check-in

css/app.css                      Product layout additions
css/tokens.css                   Design tokens
css/components.css               Shared components
js/app.js                        Local-first app logic
netlify/functions/               Stripe Checkout and webhook serverless boundaries
```

## Netlify Deployment

- Build command: leave blank
- Publish directory: `.`

Set these environment variables before enabling real Stripe calls:

```text
STRIPE_WEBHOOK_SECRET=whsec_...
STUBB_SECRET_KEY_ENCRYPTION_KEY=<32 random bytes encoded as base64url>
WHOLEGRAIN_LINK_SECRET=<same shared secret used by Wholegrain Studios>
STUBB_RESTORE_SECRET=<optional separate HMAC secret for restore tokens>
```

`netlify.toml` includes share-style rewrites for `/events/:org`, `/events/:org/:event`,
`/checkout`, and `/tickets/:ticket_id`.

## Wholegrain Account Linking

Stubb redirects users to:

```text
https://wholegrainstudios.co.uk/accounts/link?game=stubb&gameName=Stubb&gameAccountId=<local-id>&returnTo=<stubb-account-url>
```

The Wholegrain Studios project must add a matching `stubb` entry to `ACTIVE_GAME_LINKS` in
`netlify/functions/link-game-account.js`:

```js
stubb: {
  name: "Stubb",
  endpointEnv: "STUBB_LINK_ENDPOINT",
  returnOriginsEnv: "STUBB_RETURN_ORIGINS",
  restoreTokenParam: "stubbRestoreToken"
}
```

On the Wholegrain Studios Netlify site, set:

```text
STUBB_LINK_ENDPOINT=https://stubb.wholegrainstudios.co.uk/.netlify/functions/stubb-profile?action=link-wholegrain-account
STUBB_RETURN_ORIGINS=https://stubb.wholegrainstudios.co.uk
WHOLEGRAIN_LINK_SECRET=<same shared secret used by Stubb>
```
