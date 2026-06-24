const { getDb } = require("./_lib/db");
const { httpError, json } = require("./_lib/http");
const { clean, hmacHex, requireEnv, timingSafeEqual } = require("./_lib/security");
const { exchangeOAuthCode, retrieveConnectedAccount } = require("./_lib/stripe");

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod !== "GET") throw httpError(405, "Method not allowed.");
    const params = event.queryStringParameters || {};
    if (params.error) throw httpError(400, params.error_description || params.error);
    if (!params.code || !params.state) throw httpError(400, "Missing Stripe Connect callback fields.");

    const state = verifyState(params.state);
    const token = await exchangeOAuthCode(requireEnv("STRIPE_PLATFORM_SECRET_KEY"), params.code);
    const stripeAccountId = token.stripe_user_id;
    if (!stripeAccountId) throw httpError(502, "Stripe did not return a connected account ID.");

    const account = await retrieveConnectedAccount(requireEnv("STRIPE_PLATFORM_SECRET_KEY"), stripeAccountId);
    const db = await getDb();
    await db.sql`
      INSERT INTO organiser_stripe_accounts (
        organiser_id,
        stripe_account_id,
        livemode,
        charges_enabled,
        payouts_enabled,
        details_submitted,
        updated_at
      )
      VALUES (
        ${state.organiserId},
        ${stripeAccountId},
        ${Boolean(account.livemode)},
        ${Boolean(account.charges_enabled)},
        ${Boolean(account.payouts_enabled)},
        ${Boolean(account.details_submitted)},
        now()
      )
      ON CONFLICT (organiser_id)
      DO UPDATE SET
        stripe_account_id = EXCLUDED.stripe_account_id,
        livemode = EXCLUDED.livemode,
        charges_enabled = EXCLUDED.charges_enabled,
        payouts_enabled = EXCLUDED.payouts_enabled,
        details_submitted = EXCLUDED.details_submitted,
        updated_at = now()
    `;

    return {
      statusCode: 302,
      headers: {
        Location: safeReturnTo(state.returnTo, event)
      },
      body: ""
    };
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Unable to finish Stripe Connect." });
  }
};

function verifyState(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature || !timingSafeEqual(hmacHex(stateSecret(), encoded), signature)) {
    throw httpError(401, "Invalid Stripe Connect state.");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!payload.organiserId || Math.abs(Date.now() - Number(payload.createdAt || 0)) > 10 * 60 * 1000) {
    throw httpError(401, "Expired Stripe Connect state.");
  }
  return payload;
}

function stateSecret() {
  return clean(process.env.STUBB_CONNECT_STATE_SECRET) || requireEnv("WHOLEGRAIN_LINK_SECRET");
}

function safeReturnTo(value, event) {
  const fallback = `${event.headers["x-forwarded-proto"] || "https"}://${event.headers.host}/account.html?stripe=connected`;
  try {
    const url = new URL(value || fallback);
    const fallbackUrl = new URL(fallback);
    return url.origin === fallbackUrl.origin ? url.toString() : fallback;
  } catch (_) {
    return fallback;
  }
}
