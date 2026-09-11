const BASE_URL = process.env.CRM_BASE_URL || "https://survivalproject.lovable.app";
const SECRET = process.env.YOUTUBE_INGEST_SECRET;
const API_KEY = process.env.YOUTUBE_API_KEY;
const LIMIT = Math.max(1, Math.min(2000, Number(process.env.YOUTUBE_VERIFY_LIMIT || 1000)));

if (!SECRET) throw new Error("Missing YOUTUBE_INGEST_SECRET");
if (!API_KEY) throw new Error("Missing YOUTUBE_API_KEY");

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/&/g, "and")
    .replace(/\b(the|official|channel|youtube)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value) {
  return new Set(normalizeName(value).split(" ").filter((x) => x.length > 1));
}

function nameMatch(expected, actual) {
  const a = normalizeName(expected);
  const b = normalizeName(actual);
  if (!a || !b) return { status: "review", reason: "Missing candidate or YouTube title" };
  if (a === b) return { status: "verified", reason: "Exact normalized channel-name match" };
  if (a.includes(b) || b.includes(a)) return { status: "verified", reason: "Strong normalized channel-name match" };
  const at = tokens(a), bt = tokens(b);
  const overlap = [...at].filter((t) => bt.has(t)).length;
  const denominator = Math.max(1, Math.min(at.size, bt.size));
  const ratio = overlap / denominator;
  if (overlap >= 2 && ratio >= 0.75) return { status: "verified", reason: "Strong token channel-name match" };
  if (overlap >= 1 && ratio >= 0.5) return { status: "review", reason: "Possible channel-name match; manual review recommended" };
  return { status: "mismatch", reason: "Candidate name does not match current YouTube channel title" };
}

async function crm(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "x-ingest-secret": SECRET, "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 1000)}`);
  return JSON.parse(text);
}

async function youtubeChannels(ids) {
  const out = new Map();
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: batch.join(","),
      maxResults: "50",
      key: API_KEY,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
    const text = await res.text();
    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}: ${text.slice(0, 1000)}`);
    const data = JSON.parse(text);
    for (const item of data.items || []) out.set(item.id, item);
  }
  return out;
}

const queue = await crm(`/api/public/youtube-verification?limit=${LIMIT}`, { method: "GET" });
const rows = Array.isArray(queue.rows) ? queue.rows : [];
console.log(`Pending candidates received: ${rows.length}`);
if (!rows.length) process.exit(0);

const details = await youtubeChannels([...new Set(rows.map((r) => r.channel_id).filter(Boolean))]);
const results = [];
let notReturned = 0;
for (const row of rows) {
  const item = details.get(row.channel_id);
  if (!item) {
    notReturned += 1;
    results.push({
      id: row.id,
      actual_channel_id: row.channel_id,
      actual_title: row.channel_title || row.channel_id,
      subscriber_count: row.subscriber_count ?? null,
      video_count: row.video_count ?? null,
      country: row.country ?? null,
      verification: "mismatch",
      reason: "Stored YouTube channel ID was not returned by the YouTube API",
    });
    continue;
  }
  const match = nameMatch(row.channel_title, item.snippet?.title);
  let status = match.status;
  let reason = match.reason;
  const subs = item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? 0);
  if (row.duplicate_live_creator) {
    status = "review";
    reason += "; channel ID already exists in live creators";
  } else if (subs != null && subs > 20000) {
    status = "review";
    reason += "; over 20,000-subscriber campaign limit";
  }
  results.push({
    id: row.id,
    actual_channel_id: item.id,
    actual_title: item.snippet?.title || row.channel_title || row.channel_id,
    subscriber_count: subs,
    video_count: Number(item.statistics?.videoCount ?? 0),
    country: item.snippet?.country || row.country || null,
    verification: status,
    reason,
  });
}

const totals = { verified: 0, review: 0, mismatch: 0, auto_classified_creator: 0, missing: 0 };
for (let start = 0; start < results.length; start += 100) {
  const batch = results.slice(start, start + 100);
  const applied = await crm("/api/public/youtube-verification", { method: "POST", body: JSON.stringify({ rows: batch }) });
  for (const key of Object.keys(totals)) totals[key] += Number(applied[key] || 0);
}

console.log(JSON.stringify({ examined: rows.length, youtube_not_returned: notReturned, ...totals }, null, 2));
