const crypto = require("crypto");

function clean(value) {
  return String(value || "").trim();
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hmacHex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function requireEnv(name) {
  const value = clean(process.env[name]);
  if (!value) throw Object.assign(new Error(`Missing ${name}.`), { statusCode: 501 });
  return value;
}

function encryptionKey() {
  const raw = requireEnv("STUBB_SECRET_KEY_ENCRYPTION_KEY");
  const decoded = /^[A-Za-z0-9_-]{43,44}$/.test(raw)
    ? Buffer.from(raw, "base64url")
    : Buffer.from(raw, "base64");
  if (decoded.length !== 32) {
    throw Object.assign(new Error("STUBB_SECRET_KEY_ENCRYPTION_KEY must decode to 32 bytes."), { statusCode: 501 });
  }
  return decoded;
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(payload) {
  const [version, iv, tag, encrypted] = String(payload || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw Object.assign(new Error("Stored secret has an unsupported format."), { statusCode: 500 });
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function secretHint(secret) {
  const value = clean(secret);
  return value.length <= 8 ? "configured" : `${value.slice(0, 7)}...${value.slice(-4)}`;
}

module.exports = { clean, decryptSecret, encryptSecret, hmacHex, requireEnv, secretHint, timingSafeEqual };
