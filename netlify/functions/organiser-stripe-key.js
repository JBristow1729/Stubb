const { getDb } = require("./_lib/db");
const { httpError, json, method, parseJson } = require("./_lib/http");
const { clean, encryptSecret, secretHint } = require("./_lib/security");

exports.handler = async function handler(event) {
  try {
    method(event, "POST");
    const body = parseJson(event);
    const organiserId = clean(event.headers["x-stubb-account-id"] || body.organiserId);
    const stripeSecretKey = clean(body.stripeSecretKey);

    if (!organiserId) throw httpError(401, "Missing organiser account context.");
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9_]+$/.test(stripeSecretKey)) {
      throw httpError(400, "Stripe key must be a test or live secret/restricted key.");
    }

    const mode = stripeSecretKey.startsWith("sk_live_") || stripeSecretKey.startsWith("rk_live_") ? "live" : "test";
    const db = await getDb();
    await db.sql`
      INSERT INTO organiser_stripe_credentials (
        organiser_id,
        key_hint,
        encrypted_secret,
        encryption_key_version,
        mode,
        updated_at
      )
      VALUES (
        ${organiserId},
        ${secretHint(stripeSecretKey)},
        ${encryptSecret(stripeSecretKey)},
        ${"v1"},
        ${mode},
        now()
      )
      ON CONFLICT (organiser_id)
      DO UPDATE SET
        key_hint = EXCLUDED.key_hint,
        encrypted_secret = EXCLUDED.encrypted_secret,
        encryption_key_version = EXCLUDED.encryption_key_version,
        mode = EXCLUDED.mode,
        updated_at = now()
    `;

    return json(200, { saved: true, mode, keyHint: secretHint(stripeSecretKey) });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Unable to save Stripe key." });
  }
};
