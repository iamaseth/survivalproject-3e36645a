import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const ingestSecret = process.env.YOUTUBE_INGEST_SECRET || '';
const maxCreators = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_LIMIT || 5), 500));
const videosPerChannel = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_VIDEOS || 10), 15));

if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
if (!publishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is required');
if (!ingestSecret) throw new Error('YOUTUBE_INGEST_SECRET is required');

const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlRx = /https?:\/\/[^\s<>"'\])}]+/gi;
const invalidEmail = (e) => !e || /example\.(com|org|net)$/i.test(e) || /^(?:noreply|no-reply|donotreply)@/i.test(e) || /\.(png|jpe?g|gif|webp|svg|ico|css|js)$/i.test(e);
const uniq = (xs) => [...new Set(xs.filter(Boolean))];

function emails(text) {
  return uniq((String(text || '').match(emailRx) || []).map(x => x.toLowerCase().replace(/[.,;:)\]]+$/, ''))).filter(e => !invalidEmail(e));
}
function links(text) {
  return uniq((String(text || '').match(urlRx) || []).map(x => x.replace(/[.,;:!?]+$/, ''))).slice(0, 50);
}
function kind(url) {
  const s = String(url).toLowerCase();
  if (s.includes('instagram.com/')) return 'instagram';
  if (s.includes('tiktok.com/')) return 'tiktok';
  if (s.includes('facebook.com/') || s.includes('fb.com/')) return 'facebook';
  if (s.includes('linktr.ee/') || s.includes('beacons.ai/') || s.includes('bio.site/') || s.includes('lnk.bio/') || s.includes('solo.to/') || s.includes('campsite.bio/')) return 'link_hub';
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
function bestEmail(found) {
  return [...found].sort((a, b) => scoreEmail(b.email) - scoreEmail(a.email))[0] || null;
}

async function rpc(name, body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase RPC ${name} ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function ytJson(args) {
  const { stdout } = await execFileAsync(
    'yt-dlp',
    ['--no-warnings', '--socket-timeout', '12', '--retries', '1', '--extractor-retries', '1', ...args],
    { maxBuffer: 20 * 1024 * 1024, timeout: 90000 },
  );
  return JSON.parse(stdout);
}

const queueResponse = await rpc('youtube_deep_enrichment_queue', {
  p_secret: ingestSecret,
  p_limit: maxCreators,
});
const queue = Array.isArray(queueResponse) ? queueResponse : [];
console.log(`Qualified no-email creators queued: ${queue.length}`);

let checked = 0;
let emailsAdded = 0;
let linksFound = 0;
let errors = 0;

for (const row of queue) {
  checked += 1;
  const title = row.channel_title || row.channel_id;
  const channelUrl = row.channel_url || `https://www.youtube.com/channel/${row.channel_id}`;
  let checkedVideos = 0;
  const foundEmails = [];
  const foundLinks = [];
  let errorText = null;

  try {
    const playlist = await ytJson([
      '--flat-playlist',
      '--playlist-end', String(videosPerChannel),
      '--dump-single-json',
      channelUrl.replace(/\/$/, '') + '/videos',
    ]);
    const entries = Array.isArray(playlist.entries) ? playlist.entries : [];

    for (const entry of entries.slice(0, videosPerChannel)) {
      const id = entry && (entry.id || entry.url);
      if (!id) continue;
      const videoUrl = String(id).startsWith('http') ? String(id) : `https://www.youtube.com/watch?v=${id}`;
      try {
        const video = await ytJson(['--skip-download', '--dump-single-json', videoUrl]);
        checkedVideos += 1;
        const description = String(video.description || '');
        for (const email of emails(description)) foundEmails.push({ email, source: videoUrl });
        for (const url of links(description)) {
          foundLinks.push({ kind: kind(url), url, source: `Public YouTube video description: ${videoUrl}` });
        }
        if (foundEmails.length) break;
      } catch {}
    }
  } catch (e) {
    errorText = String(e && e.message ? e.message : e).slice(0, 500);
    errors += 1;
  }

  const best = bestEmail(foundEmails);
  const uniqueLinks = [...new Map(foundLinks.map(item => [`${item.kind}:${item.url}`, item])).values()].slice(0, 100);
  linksFound += uniqueLinks.length;

  const applied = await rpc('youtube_deep_enrichment_apply', {
    p_secret: ingestSecret,
    p_rows: [{
      id: row.id,
      business_email: best ? best.email : null,
      email_source: best ? `Public YouTube video description: ${best.source}` : null,
      external_links: uniqueLinks,
      checked_videos: checkedVideos,
      status: best || uniqueLinks.length ? 'found' : errorText ? 'error' : 'no_email_found',
      error: errorText,
    }],
  });

  emailsAdded += Number(applied?.emailAdded || 0);
  console.log(`[${checked}/${queue.length}] ${title}: videos=${checkedVideos} email=${best ? best.email : 'none'} links=${uniqueLinks.length}${errorText ? ' ERROR' : ''}`);
}

console.log(JSON.stringify({ checked, emailsAdded, linksFound, errors }, null, 2));
