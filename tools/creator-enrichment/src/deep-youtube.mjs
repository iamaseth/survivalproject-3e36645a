import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const maxCreators = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_LIMIT || 500), 500));
const videosPerChannel = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_VIDEOS || 10), 15));

if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlRx = /https?:\/\/[^\s<>"'\])}]+/gi;

const invalidEmail = (e) => !e || /example\.(com|org|net)$/i.test(e) || /^(?:noreply|no-reply|donotreply)@/i.test(e) || /\.(png|jpe?g|gif|webp|svg|ico|css|js)$/i.test(e);
const uniq = (xs) => [...new Set(xs.filter(Boolean))];
function emails(text) { return uniq((String(text || '').match(emailRx) || []).map(x => x.toLowerCase().replace(/[.,;:)\]]+$/, ''))).filter(e => !invalidEmail(e)); }
function links(text) { return uniq((String(text || '').match(urlRx) || []).map(x => x.replace(/[.,;:!?]+$/, ''))).slice(0, 50); }
function kind(url) {
  const s = String(url).toLowerCase();
  if (s.includes('instagram.com/')) return 'instagram';
  if (s.includes('tiktok.com/')) return 'tiktok';
  if (s.includes('facebook.com/') || s.includes('fb.com/')) return 'facebook';
  if (s.includes('linktr.ee/') || s.includes('beacons.ai/') || s.includes('bio.site/')) return 'link_hub';
  if (/amazon\.[^/]+\/shop\//.test(s)) return 'amazon_storefront';
  return 'website';
}
function scoreEmail(e) {
  const local = e.split('@')[0] || '';
  let score = 0;
  if (/business|contact|collab|collaboration|sponsor|partnership|media|press|hello|info|inquir/i.test(local)) score += 5;
  if (/support|service|admin/i.test(local)) score += 1;
  if (/gmail\.com$|outlook\.com$|yahoo\.com$|proton\.me$|icloud\.com$/i.test(e)) score += 2;
  return score;
}
function bestEmail(found) { return [...found].sort((a,b) => scoreEmail(b.email) - scoreEmail(a.email))[0] || null; }

async function sb(path, options = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`Supabase ${options.method || 'GET'} failed ${res.status}: ${(await res.text()).slice(0,500)}`);
  if (res.status === 204) return null;
  return res.json();
}

async function ytJson(args) {
  const { stdout } = await execFileAsync('yt-dlp', ['--no-warnings','--socket-timeout','12','--retries','1','--extractor-retries','1', ...args], { maxBuffer: 20 * 1024 * 1024, timeout: 90000 });
  return JSON.parse(stdout);
}

const q = new URLSearchParams({
  select: 'id,channel_id,channel_url,channel_title,subscriber_count,business_email,description_email,external_links,notes',
  status: 'eq.kept',
  business_email: 'is.null',
  description_email: 'is.null',
  order: 'subscriber_count.desc.nullslast',
  limit: String(maxCreators),
});
const rows = await sb(`youtube_candidates?${q}`);
const queue = (rows || []).filter(r => !String(r.notes || '').includes('Deep YouTube bulk pass checked'));
console.log(`Qualified no-email creators queued: ${queue.length}`);

let checked = 0, emailsAdded = 0, linksAdded = 0, errors = 0;
for (const row of queue) {
  checked += 1;
  const title = row.channel_title || row.channel_id;
  const channelUrl = row.channel_url || `https://www.youtube.com/channel/${row.channel_id}`;
  let checkedVideos = 0;
  const foundEmails = [];
  const foundLinks = [];
  let errorText = null;
  try {
    const playlist = await ytJson(['--flat-playlist','--playlist-end',String(videosPerChannel),'--dump-single-json', channelUrl.replace(/\/$/,'') + '/videos']);
    const entries = Array.isArray(playlist.entries) ? playlist.entries : [];
    for (const entry of entries.slice(0, videosPerChannel)) {
      const id = entry && (entry.id || entry.url);
      if (!id) continue;
      const videoUrl = String(id).startsWith('http') ? String(id) : `https://www.youtube.com/watch?v=${id}`;
      try {
        const video = await ytJson(['--skip-download','--dump-single-json', videoUrl]);
        checkedVideos += 1;
        const description = String(video.description || '');
        for (const email of emails(description)) foundEmails.push({ email, source: videoUrl });
        for (const url of links(description)) foundLinks.push({ kind: kind(url), url, source: 'Public YouTube video description' });
        if (foundEmails.length) break;
      } catch {}
    }
  } catch (e) {
    errorText = String(e && e.message ? e.message : e).slice(0, 500);
    errors += 1;
  }

  const currentLinks = Array.isArray(row.external_links) ? row.external_links.filter(x => x && typeof x === 'object') : [];
  const seen = new Set(currentLinks.map(x => `${x.kind || ''}:${x.url || ''}`));
  for (const item of foundLinks) {
    const key = `${item.kind}:${item.url}`;
    if (!seen.has(key)) { currentLinks.push(item); seen.add(key); linksAdded += 1; }
  }
  const best = bestEmail(foundEmails);
  if (best) emailsAdded += 1;
  const note = `Deep YouTube bulk pass checked ${checkedVideos} recent video descriptions; ${best ? 'public email found' : 'no public email found'}.`;
  const notes = String(row.notes || '').includes(note) ? row.notes : `${row.notes || ''}${row.notes ? ' | ' : ''}${note}`;
  const patch = {
    business_email: best ? best.email : null,
    email_status: best ? 'found' : errorText ? 'error' : 'none',
    email_source: best ? best.source : null,
    external_links: currentLinks,
    enrichment_status: best || foundLinks.length ? 'found' : errorText ? 'error' : 'no_email_found',
    enrichment_checked_at: new Date().toISOString(),
    enrichment_error: errorText,
    notes,
  };
  await sb(`youtube_candidates?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  console.log(`[${checked}/${queue.length}] ${title}: videos=${checkedVideos} email=${best ? best.email : 'none'} links=${foundLinks.length}${errorText ? ' ERROR' : ''}`);
}

console.log(JSON.stringify({ checked, emailsAdded, linksAdded, errors }, null, 2));