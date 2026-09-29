// Local Open & Paste worker. NEVER clicks Send. See docs/OUTREACH-BROWSER-WORKER.md
import http from "node:http";
import { validateOpenAndPaste, MAX_BODY_BYTES } from "./validate.mjs";

const VERSION = "0.1.0";
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4317);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const USER_DATA_DIR = process.env.USER_DATA_DIR || "./.chrome-outreach-profile";
const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";
const COOLDOWN_MS = Number(process.env.COOLDOWN_MINUTES || 10) * 60_000;

if (HOST !== "127.0.0.1" && HOST !== "localhost") {
  console.error(`Refusing to bind ${HOST}. Only 127.0.0.1 is allowed.`);
  process.exit(1);
}

const recent = new Map(); // creatorId -> timestamp
let busy = false;
let context = null;

const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o })); // never log message/cookies

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    return true;
  }
  return !origin; // allow same-machine curl without Origin
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error("too large"), { code: "TOO_LARGE" })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function getContext() {
  if (context) return context;
  const { chromium } = await import("playwright");
  // Attach to a normal Chrome instance started by the user with remote debugging.
  // This avoids a separate Playwright-managed login profile. Chrome must be started
  // with --remote-debugging-port=9222 and a non-default user-data-dir.
  const browser = await chromium.connectOverCDP(CDP_URL);
  context = browser.contexts()[0];
  if (!context) throw new Error("No Chrome context available over CDP");
  browser.on("disconnected", () => { context = null; });
  return context;
}

async function detectStop(page) {
  const text = ((await page.textContent("body").catch(() => "")) || "").toLowerCase();
  if (/captcha|verify you are human|drag the slider|puzzle/.test(text)) return "stopped_captcha";
  if (/suspicious activity|security check|unusual activity/.test(text)) return "stopped_security_warning";
  if (/account (is )?(restricted|suspended|temporarily blocked)|try again later/.test(text)) return "stopped_account_restricted";
  if (/\/login|accounts\/login/.test(page.url()) || /log in to (tiktok|instagram)|sign up for tiktok/.test(text)) return "stopped_login_required";
  return null;
}

async function openAndPaste({ creatorId, platform, profileUrl }) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  const stop = await detectStop(page);
  if (stop) return { success: false, status: stop, error: "Stopped for human attention. Nothing was pasted or sent." };
  // V1: reliable messaging selectors not established. Do NOT guess; do NOT paste; NEVER send.
  return { success: true, status: "profile_opened_paste_not_implemented", error: "Profile opened. Open messages and paste manually." };
}

const server = http.createServer(async (req, res) => {
  const allowed = cors(req, res);
  if (!allowed) return send(res, 403, { success: false, status: "origin_not_allowed" });
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const path = new URL(req.url, "http://127.0.0.1").pathname;

  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true, version: VERSION });

  if (req.method === "POST" && path === "/open-and-paste") {
    let raw;
    try { raw = await readBody(req); } catch (e) {
      return send(res, 413, { success: false, status: e.code === "TOO_LARGE" ? "message_too_long" : "invalid_request" });
    }
    let body; try { body = JSON.parse(raw); } catch { return send(res, 400, { success: false, status: "invalid_request", error: "Invalid JSON" }); }
    const v = validateOpenAndPaste(body);
    if (!v.ok) { log({ event: "rejected", status: v.status }); return send(res, 400, { success: false, status: v.status, error: v.error }); }
    const { creatorId, platform, profileUrl } = v.value;
    const last = recent.get(creatorId);
    if (last && Date.now() - last < COOLDOWN_MS) return send(res, 409, { success: false, status: "duplicate_recent_attempt" });
    if (busy) return send(res, 429, { success: false, status: "busy" });
    busy = true; recent.set(creatorId, Date.now());
    try {
      const result = await openAndPaste(v.value);
      log({ event: "open_and_paste", creatorId, platform, host: new URL(profileUrl).hostname, status: result.status });
      return send(res, 200, result);
    } catch (e) {
      log({ event: "open_and_paste", creatorId, status: "internal_error", err: String(e?.message || e).slice(0, 200) });
      return send(res, 500, { success: false, status: "internal_error", error: "Worker error; see terminal" });
    } finally { busy = false; }
  }

  send(res, 404, { success: false, status: "not_found" });
});

server.listen(PORT, HOST, () => log({ event: "listening", host: HOST, port: PORT, origins: ORIGINS, version: VERSION }));
