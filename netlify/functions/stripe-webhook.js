const crypto = require("crypto");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return json(501, { error: "Webhook secret is not configured" });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  if (!verifyStripeSignature(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)) {
    return json(400, { error: "Invalid Stripe signature" });
  }

  const stripeEvent = JSON.parse(rawBody);
  if (stripeEvent.type === "checkout.session.completed") {
    // Production hook: create paid tickets in a database, then send email.
    // This static build cannot safely persist shared ticket state server-side.
    return json(200, { received: true, action: "issue_ticket" });
  }
  if (stripeEvent.type === "checkout.session.expired" || stripeEvent.type === "payment_intent.payment_failed") {
    return json(200, { received: true, action: "cancel_pending_attendee" });
  }
  return json(200, { received: true });
};

function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(part => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
