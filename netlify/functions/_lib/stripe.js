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

async function createCheckoutSession(secretKey, fields) {
  const form = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.set(key, String(value));
  });

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const body = await response.json();
  if (!response.ok) throw httpError(response.status, body.error?.message || "Stripe checkout failed.");
  return body;
}

module.exports = { createCheckoutSession, verifyStripeSignature };
