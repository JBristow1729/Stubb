const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(501, {
      error: "Stripe is not configured",
      detail: "Set STRIPE_SECRET_KEY before enabling live checkout."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Invalid JSON body" });
  }

  const quantity = Math.max(1, Number(body.quantity || 1));
  const amount = Math.round(Number(body.unitAmount || 0) * 100);
  if (!body.eventId || !body.title || !body.buyerEmail || amount < 0) {
    return json(400, { error: "Missing required checkout fields" });
  }

  const origin = event.headers.origin || process.env.URL || "http://localhost:8888";
  const form = new URLSearchParams();
  form.set("mode", amount === 0 ? "payment" : "payment");
  form.set("success_url", `${origin}/ticket-page.html?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/event-page.html?event=${encodeURIComponent(body.eventId)}`);
  form.set("customer_email", body.buyerEmail);
  form.set("client_reference_id", body.eventId);
  form.set("metadata[eventId]", body.eventId);
  form.set("metadata[buyerName]", body.buyerName || "");
  form.set("metadata[buyerEmail]", body.buyerEmail);
  form.set("line_items[0][quantity]", String(quantity));
  form.set("line_items[0][price_data][currency]", "gbp");
  form.set("line_items[0][price_data][unit_amount]", String(amount));
  form.set("line_items[0][price_data][product_data][name]", body.title);

  const response = await fetch(STRIPE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const session = await response.json();
  if (!response.ok) return json(response.status, { error: session.error?.message || "Stripe checkout failed" });
  return json(200, { id: session.id, url: session.url });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
