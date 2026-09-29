export const MAX_MESSAGE = 2000;
export const MAX_BODY_BYTES = 16 * 1024;
export const ALLOWED_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "instagram.com", "www.instagram.com"]);
const FORBIDDEN_KEYS = ["send", "autoSend", "clickSend", "submit"];

/** Returns { ok: true, value } or { ok: false, status, error }. Pure, no I/O. */
export function validateOpenAndPaste(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_request", "Body must be a JSON object");
  for (const k of FORBIDDEN_KEYS) if (k in body) return fail("send_forbidden", "Send actions are not allowed");
  const { creatorId, platform, profileUrl, message } = body;
  if (typeof creatorId !== "string" || !creatorId.trim() || creatorId.length > 100) return fail("invalid_request", "creatorId required");
  if (typeof platform !== "string" || platform.length > 40) return fail("invalid_request", "platform required");
  if (typeof message !== "string" || !message.trim()) return fail("invalid_request", "message required");
  if (message.length > MAX_MESSAGE) return fail("message_too_long", `Max ${MAX_MESSAGE} characters`);
  let u;
  try { u = new URL(profileUrl); } catch { return fail("invalid_request", "profileUrl invalid"); }
  if (u.protocol !== "https:") return fail("host_not_allowed", "https only");
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return fail("host_not_allowed", "Only TikTok/Instagram profiles");
  if (u.username || u.password) return fail("host_not_allowed", "Credentials in URL not allowed");
  return { ok: true, value: { creatorId: creatorId.trim(), platform, profileUrl: u.toString(), message } };
}

function fail(status, error) { return { ok: false, status, error }; }
