const { httpError, json, method, parseJson } = require("./_lib/http");
const { clean, hmacHex, requireEnv } = require("./_lib/security");

const AUTHORIZE_URL = "https://connect.stripe.com/oauth/authorize";

exports.handler = async function handler(event) {
  try {
    method(event, "POST");
    const body = parseJson(event);
    const organiserId = clean(event.headers["x-stubb-account-id"] || body.organiserId);
    if (!organiserId) throw httpError(401, "Missing organiser account context.");

    const origin = event.headers.origin || process.env.URL || "http://localhost:8888";
    const redirectUri = clean(process.env.STRIPE_CONNECT_REDIRECT_URI)
      || `${origin}/.netlify/functions/stripe-connect-callback`;
    const state = signState({
      organiserId,
      returnTo: clean(body.returnTo) || `${origin}/account.html?stripe=connected`,
      createdAt: Date.now()
    });

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", requireEnv("STRIPE_CONNECT_CLIENT_ID"));
    url.searchParams.set("scope", "read_write");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    if (body.email) url.searchParams.set("stripe_user[email]", clean(body.email));
    if (body.businessName) url.searchParams.set("stripe_user[business_name]", clean(body.businessName));
    if (body.businessUrl) url.searchParams.set("stripe_user[url]", clean(body.businessUrl));
    if (body.productDescription) url.searchParams.set("stripe_user[product_description]", clean(body.productDescription));

    return json(200, { url: url.toString() });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Unable to start Stripe Connect." });
  }
};

function signState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmacHex(stateSecret(), encoded)}`;
}

function stateSecret() {
  return clean(process.env.STUBB_CONNECT_STATE_SECRET) || requireEnv("WHOLEGRAIN_LINK_SECRET");
}
