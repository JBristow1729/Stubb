const crypto = require("crypto");

exports.handler = async function handler(event) {
  try {
    return await route(event);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Stubb profile request failed." });
  }
};

async function route(event) {
  const action = event.queryStringParameters?.action || new URLSearchParams(event.rawQuery || "").get("action");

  if (event.httpMethod === "POST" && action === "link-wholegrain-account") {
    requireWholegrainLinkSecret(event);
    const body = parseBody(event);
    if (!body.identityId || !body.gameAccountId) {
      return json(400, { error: "Wholegrain identity id and Stubb account id are required." });
    }

    return json(200, {
      profile: profileFromLink(body),
      restoreToken: signRestoreToken({
        id: clean(body.gameAccountId),
        identityId: clean(body.identityId),
        identityEmail: clean(body.identityEmail),
        createdAt: Date.now()
      })
    });
  }

  if (event.httpMethod === "POST" && action === "restore-wholegrain-profile") {
    const body = parseBody(event);
    if (!body.restoreToken) return json(400, { error: "Restore token is required." });
    const payload = verifyRestoreToken(body.restoreToken);
    return json(200, { profile: profileFromLink(payload) });
  }

  return json(404, { error: "Unknown Stubb profile action." });
}

function profileFromLink(body) {
  return {
    id: clean(body.id || body.gameAccountId),
    identityId: clean(body.identityId),
    identityEmail: clean(body.identityEmail),
    email: clean(body.identityEmail),
    name: clean(body.identityEmail).split("@")[0] || ""
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (_) {
    throw Object.assign(new Error("Invalid JSON body."), { statusCode: 400 });
  }
}

function requireWholegrainLinkSecret(event) {
  const expected = clean(process.env.WHOLEGRAIN_LINK_SECRET);
  const provided = clean(event.headers["x-wholegrain-link-secret"] || event.headers["X-Wholegrain-Link-Secret"]);
  if (!expected || !provided || !timingSafeEqual(expected, provided)) {
    throw Object.assign(new Error("Unauthorised Wholegrain account link."), { statusCode: 401 });
  }
}

function signRestoreToken(payload) {
  const encoded = base64Url(JSON.stringify(payload));
  const signature = hmac(encoded);
  return `${encoded}.${signature}`;
}

function verifyRestoreToken(token) {
  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature || !timingSafeEqual(hmac(encoded), signature)) {
    throw Object.assign(new Error("Invalid restore token."), { statusCode: 401 });
  }
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function hmac(value) {
  const secret = clean(process.env.STUBB_RESTORE_SECRET || process.env.WHOLEGRAIN_LINK_SECRET);
  if (!secret) throw Object.assign(new Error("Missing restore secret."), { statusCode: 501 });
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function clean(value) {
  return String(value || "").trim();
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
