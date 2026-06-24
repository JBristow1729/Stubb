function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function parseJson(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (_) {
    throw httpError(400, "Invalid JSON body.");
  }
}

function rawBody(event) {
  if (event.isBase64Encoded) return Buffer.from(event.body || "", "base64").toString("utf8");
  return event.body || "";
}

function method(event, expected) {
  if (event.httpMethod !== expected) throw httpError(405, "Method not allowed.");
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

module.exports = { httpError, json, method, parseJson, rawBody };
