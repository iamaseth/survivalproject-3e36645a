const BASE_URL = process.env.CRM_BASE_URL || "https://survivalproject.lovable.app";
const SECRET = process.env.YOUTUBE_INGEST_SECRET;
const API_KEY = process.env.YOUTUBE_API_KEY;
const LIMIT = Math.max(1, Math.min(500, Number(process.env.RECOVERY_LIMIT || 100)));
const VIDEOS = Math.max(1, Math.min(15, Number(process.env.RECOVERY_VIDEOS || 10)));
if (!SECRET) throw new Error("Missing YOUTUBE_INGEST_SECRET");
if (!API_KEY) throw new Error("Missing YOUTUBE_API_KEY");

const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlRx = /https?:\/\/[^\s<>"'\])}]+/gi;
const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const emails = (text) => uniq((String(text || "").match(emailRx) || []).map((x) => x.toLowerCase().replace(/[.,;:)\]]+$/, "")));
const urls = (text) => uniq((String(text || "").match(urlRx) || []).map((x) => x.replace(/[.,;:!?]+$/, "")));
function kind(url) {
  const s = String(url).toLowerCase();
  if (s.includes("instagram.com/")) return "instagram";
  if (s.includes("tiktok.com/")) return "tiktok";
  if (s.includes("facebook.com/") || s.includes("fb.com/")) return "facebook";
  if (s.includes("linktr.ee/") || s.includes("beacons.ai/") || s.includes("bio.site/") || s.includes("lnk.bio/")) return "link_hub";
  if (/amazon\.[^/]+\/shop\//.test(s)) return "amazon_storefront";
  return "website";
}
async function crm(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers: { "x-ingest-secret": SECRET, "content-type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}
async function yt(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: API_KEY });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube ${endpoint} HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}
function recentEnough(value) {
  if (!value) return true;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && Date.now() - t <= 180 * 86400000;
}

const response = await crm(`/api/public/youtube-verification?limit=${LIMIT}`, { method: "GET" });
const rows = (Array.isArray(response.rows) ? response.rows : []).filter((r) => r.classification === "creator" && !r.duplicate_live_creator && r.subscriber_count != null && r.subscriber_count <= 20000 && recentEnough(r.last_upload_at));
console.log(`Recovery candidates: ${rows.length}`);
let checked = 0, emailFound = 0, linksFound = 0, errors = 0;
for (const row of rows) {
  checked += 1;
  let checkedVideos = 0;
  const foundEmails = [];
  const foundLinks = [];
  let error = null;
  try {
    const channel = await yt("channels", { part: "snippet,contentDetails", id: row.channel_id, maxResults: "1" });
    const item = channel.items?.[0];
    if (!item) throw new Error("Channel not returned");
    const channelUrl = `https://www.youtube.com/channel/${row.channel_id}`;
    for (const e of emails(item.snippet?.description)) foundEmails.push({ email: e, source: channelUrl });
    for (const u of urls(item.snippet?.description)) foundLinks.push({ kind: kind(u), url: u, source: "Public YouTube channel description" });
    const uploads = item.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) {
      const playlist = await yt("playlistItems", { part: "snippet", playlistId: uploads, maxResults: String(VIDEOS) });
      for (const v of playlist.items || []) {
        checkedVideos += 1;
        const videoId = v.snippet?.resourceId?.videoId;
        const source = videoId ? `https://www.youtube.com/watch?v=${videoId}` : channelUrl;
        for (const e of emails(v.snippet?.description)) foundEmails.push({ email: e, source });
        for (const u of urls(v.snippet?.description)) foundLinks.push({ kind: kind(u), url: u, source: `Public YouTube video description: ${source}` });
      }
    }
  } catch (e) { error = String(e?.message || e).slice(0, 500); errors += 1; }
  const bestEmail = foundEmails[0] || null;
  const uniqueLinks = [...new Map(foundLinks.map((x) => [`${x.kind}:${x.url}`, x])).values()].slice(0, 100);
  if (bestEmail) emailFound += 1;
  linksFound += uniqueLinks.length;
  await crm("/api/public/youtube-deep-enrichment", { method: "POST", body: JSON.stringify({ rows: [{ id: row.id, business_email: bestEmail?.email || null, email_source: bestEmail?.source || null, external_links: uniqueLinks, checked_videos: checkedVideos, status: bestEmail || uniqueLinks.length ? "found" : error ? "error" : "no_email_found", error }] }) });
  console.log(`[${checked}/${rows.length}] ${row.channel_title}: email=${bestEmail ? "found" : "none"} links=${uniqueLinks.length}${error ? " ERROR" : ""}`);
}
console.log(JSON.stringify({ checked, emailFound, linksFound, errors }, null, 2));
