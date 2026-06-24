const crypto = require("crypto");
const { transaction } = require("./_lib/db");
const { json, method, rawBody } = require("./_lib/http");
const { requireEnv } = require("./_lib/security");
const { verifyStripeSignature } = require("./_lib/stripe");

exports.handler = async function handler(event) {
  try {
    method(event, "POST");
    const payload = rawBody(event);
    const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    if (!verifyStripeSignature(payload, signature, requireEnv("STRIPE_WEBHOOK_SECRET"))) {
      return json(400, { error: "Invalid Stripe signature." });
    }

    const stripeEvent = JSON.parse(payload);
    const result = await transaction(async client => {
      const inserted = await client.query(
        `INSERT INTO stripe_webhook_events (stripe_event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (stripe_event_id) DO NOTHING
         RETURNING stripe_event_id`,
        [stripeEvent.id, stripeEvent.type]
      );
      if (!inserted.rowCount) return { received: true, duplicate: true };

      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object;
        return issueTickets(client, session);
      }

      if (stripeEvent.type === "checkout.session.expired") {
        await client.query(
          `UPDATE checkout_orders
           SET status = 'expired', updated_at = now()
           WHERE stripe_session_id = $1 AND status = 'pending'`,
          [stripeEvent.data.object.id]
        );
        return { received: true, action: "expire_order" };
      }

      if (stripeEvent.type === "payment_intent.payment_failed") {
        await client.query(
          `UPDATE checkout_orders
           SET status = 'failed', updated_at = now()
           WHERE stripe_session_id = $1 AND status = 'pending'`,
          [stripeEvent.data.object.metadata?.checkout_session_id || ""]
        );
        return { received: true, action: "mark_failed_if_linked" };
      }

      return { received: true };
    });

    return json(200, result);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Stripe webhook failed." });
  }
};

async function issueTickets(client, session) {
  const orderId = session.metadata?.orderId || session.client_reference_id;
  const orderResult = await client.query(
    `SELECT *
     FROM checkout_orders
     WHERE id = $1
     FOR UPDATE`,
    [orderId]
  );
  const order = orderResult.rows[0];
  if (!order) return { received: true, action: "order_missing" };
  if (order.status === "paid") return { received: true, action: "already_paid" };

  await client.query(
    `UPDATE checkout_orders
     SET status = 'paid', stripe_session_id = COALESCE(stripe_session_id, $2), updated_at = now()
     WHERE id = $1`,
    [order.id, session.id]
  );

  for (let i = 0; i < order.quantity; i += 1) {
    await client.query(
      `INSERT INTO tickets (
        order_id,
        event_id,
        ticket_code,
        buyer_name,
        buyer_email
      )
      VALUES ($1, $2, $3, $4, $5)`,
      [order.id, order.event_id, ticketCode(), order.buyer_name, order.buyer_email]
    );
  }
  return { received: true, action: "issue_tickets", quantity: order.quantity };
}

function ticketCode() {
  return `STB-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}
