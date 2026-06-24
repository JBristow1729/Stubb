const { getDb } = require("./_lib/db");
const { httpError, json, method, parseJson } = require("./_lib/http");
const { decryptSecret } = require("./_lib/security");
const { createCheckoutSession } = require("./_lib/stripe");

exports.handler = async function handler(event) {
  try {
    method(event, "POST");
    const body = parseJson(event);
    const quantity = Math.max(1, Number(body.quantity || 1));
    if (!body.eventId || !body.buyerEmail || !body.buyerName) {
      throw httpError(400, "Event, buyer name, and buyer email are required.");
    }

    const db = await getDb();
    const [eventRow] = await db.sql`
      SELECT
        e.id,
        e.owner_id,
        e.title,
        e.ticket_price_pence,
        e.currency,
        e.max_tickets,
        e.status,
        e.event_date,
        e.end_time,
        c.encrypted_secret
      FROM events e
      LEFT JOIN organiser_stripe_credentials c ON c.organiser_id = e.owner_id
      WHERE e.id = ${body.eventId}
      LIMIT 1
    `;
    if (!eventRow) throw httpError(404, "Event not found.");
    if (eventRow.status !== "published") throw httpError(409, "Event is not open for checkout.");
    if (!eventRow.encrypted_secret) throw httpError(409, "The organiser has not configured Stripe.");

    const [soldRow] = await db.sql`
      SELECT count(*)::int AS sold
      FROM tickets
      WHERE event_id = ${eventRow.id}
      AND status = 'paid'
    `;
    if ((soldRow.sold + quantity) > eventRow.max_tickets) {
      throw httpError(409, "Not enough tickets remain for this event.");
    }

    const amountTotal = eventRow.ticket_price_pence * quantity;
    const [order] = await db.sql`
      INSERT INTO checkout_orders (
        event_id,
        quantity,
        buyer_name,
        buyer_email,
        amount_total_pence,
        currency
      )
      VALUES (
        ${eventRow.id},
        ${quantity},
        ${String(body.buyerName).trim()},
        ${String(body.buyerEmail).trim()},
        ${amountTotal},
        ${eventRow.currency}
      )
      RETURNING id
    `;

    const origin = event.headers.origin || process.env.URL || "http://localhost:8888";
    const session = await createCheckoutSession(decryptSecret(eventRow.encrypted_secret), {
      mode: "payment",
      success_url: `${origin}/ticket-page.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/event-page.html?event=${encodeURIComponent(eventRow.id)}`,
      customer_email: body.buyerEmail,
      client_reference_id: order.id,
      "metadata[orderId]": order.id,
      "metadata[eventId]": eventRow.id,
      "line_items[0][quantity]": quantity,
      "line_items[0][price_data][currency]": eventRow.currency,
      "line_items[0][price_data][unit_amount]": eventRow.ticket_price_pence,
      "line_items[0][price_data][product_data][name]": eventRow.title
    });

    await db.sql`
      UPDATE checkout_orders
      SET stripe_session_id = ${session.id}, updated_at = now()
      WHERE id = ${order.id}
    `;

    return json(200, { id: session.id, url: session.url, orderId: order.id });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Unable to create checkout session." });
  }
};
