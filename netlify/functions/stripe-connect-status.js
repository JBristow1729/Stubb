const { getDb } = require("./_lib/db");
const { httpError, json } = require("./_lib/http");
const { clean, requireEnv } = require("./_lib/security");
const { retrieveConnectedAccount } = require("./_lib/stripe");

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod !== "GET") throw httpError(405, "Method not allowed.");
    const organiserId = clean(event.headers["x-stubb-account-id"] || event.queryStringParameters?.organiserId);
    if (!organiserId) throw httpError(401, "Missing organiser account context.");

    const db = await getDb();
    const [stored] = await db.sql`
      SELECT stripe_account_id, livemode, charges_enabled, payouts_enabled, details_submitted, updated_at
      FROM organiser_stripe_accounts
      WHERE organiser_id = ${organiserId}
      LIMIT 1
    `;
    if (!stored) return json(200, { connected: false });

    if (event.queryStringParameters?.refresh === "1") {
      const account = await retrieveConnectedAccount(requireEnv("STRIPE_PLATFORM_SECRET_KEY"), stored.stripe_account_id);
      await db.sql`
        UPDATE organiser_stripe_accounts
        SET
          livemode = ${Boolean(account.livemode)},
          charges_enabled = ${Boolean(account.charges_enabled)},
          payouts_enabled = ${Boolean(account.payouts_enabled)},
          details_submitted = ${Boolean(account.details_submitted)},
          updated_at = now()
        WHERE organiser_id = ${organiserId}
      `;
      return json(200, accountStatus(stored.stripe_account_id, account));
    }

    return json(200, {
      connected: true,
      stripeAccountId: stored.stripe_account_id,
      livemode: stored.livemode,
      chargesEnabled: stored.charges_enabled,
      payoutsEnabled: stored.payouts_enabled,
      detailsSubmitted: stored.details_submitted,
      updatedAt: stored.updated_at
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Unable to read Stripe Connect status." });
  }
};

function accountStatus(stripeAccountId, account) {
  return {
    connected: true,
    stripeAccountId,
    livemode: Boolean(account.livemode),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted)
  };
}
