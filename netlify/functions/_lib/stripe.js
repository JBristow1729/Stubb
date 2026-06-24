const { httpError } = require("./http");
const { hmacHex, timingSafeEqual } = require("./security");

const STRIPE_API = "https://api.stripe.com/v1";

function verifyStripeSignature(payload, header, secret, toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index > 0) acc[part.slice(0, index)] = part.slice(index + 1);
    return acc;
  }, {});
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = hmacHex(secret, `${timestamp}.${payload}`);
  return timingSafeEqual(expected, parts.v1);
}

async function stripeFormRequest(path, secretKey, fields, options = {}) {
  const form = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.set(key, String(value));
  });

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (options.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
  }
  if (options.stripeAccount) headers["Stripe-Account"] = options.stripeAccount;

  const response = await fetch(`${options.baseUrl || STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: form
  });
  const body = await response.json();
  if (!response.ok) throw httpError(response.status, body.error?.message || "Stripe request failed.");
  return body;
}

async function stripeJsonRequest(path, secretKey, options = {}) {
  const headers = { Authorization: `Bearer ${secretKey}` };
  if (options.stripeAccount) headers["Stripe-Account"] = options.stripeAccount;

  const response = await fetch(`${STRIPE_API}${path}`, { method: "GET", headers });
  const body = await response.json();
  if (!response.ok) throw httpError(response.status, body.error?.message || "Stripe request failed.");
  return body;
}

function createCheckoutSession(secretKey, fields, options = {}) {
  return stripeFormRequest("/checkout/sessions", secretKey, fields, options);
}

function exchangeOAuthCode(secretKey, code) {
  return stripeFormRequest("/token", secretKey, {
    grant_type: "authorization_code",
    code
  }, {
    baseUrl: "https://connect.stripe.com/oauth",
    basicAuth: true
  });
}

function retrieveConnectedAccount(secretKey, accountId) {
  return stripeJsonRequest(`/accounts/${encodeURIComponent(accountId)}`, secretKey);
}

module.exports = {
  createCheckoutSession,
  exchangeOAuthCode,
  retrieveConnectedAccount,
  verifyStripeSignature
};
