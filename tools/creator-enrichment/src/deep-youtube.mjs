const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const ingestSecret = process.env.YOUTUBE_INGEST_SECRET || '';
const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
const maxCreators = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_LIMIT || 5), 500));
const videosPerChannel = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_VIDEOS || 10), 15));

if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
if (!publishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is required');
if (!ingestSecret) throw new Error('YOUTUBE_INGEST_SECRET is required');
if (!youtubeApiKey) throw new Error('YOUTUBE_API_KEY is required');

const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlRx = /https?:\/\/[^\s<>"'\])}]+/gi;
const uniq = (xs) => [...new Set(xs.filter(Boolean))];

function emails(text) {
  return uniq((String(text || '').match(emailRx) || [])
    .map(x => x.toLowerCase().replace(/[.,;:)\]]+$/, '')))
    .filter(e => e && !/example\.(com|org|net)$/i.test(e) && !/^(?:noreply|no-reply|donotreply)@/i.test(e));
}

function links(text) {
  return uniq((String(text || '').match(urlRx) || [])
    .map(x => x.replace(/[.,;:!?]+$/, ''))).slice(0, 50);
}

function kind(url) {
  const s = String(url).toLowerCase();
  if (s.includes('instagram.com/')) return 'instagram';
  if (s.includes('tiktok.com/')) return 'tiktok';
  if (s.includes('facebook.com/') || s.includes('fb.com/')) return 'facebook';
  if (s.includes('linktr.ee/') || s.includes('beacons.ai/') || s.includes('bio.site/') || s.includes('lnk.bio/')) return 'link_hub';
  if (/amazon\.[^/]+\/shop\//.test(s)) return 'amazon_storefront';
  return 'website';
}

function scoreEmail(e) {
  const local = e.split('@')[0] || '';
  let score = 0;
  if (/business|contact|collab|sponsor|partner|media|press|hello|info|inquir/i.test(local)) score += 5;
  if (/gmail\.com$|outlook\.com$|yahoo\.com$|proton\.me$|icloud\.com$/i.test(e)) score += 2;
  return score;
}

function bestEmail(found) {
  return [...found].sort((a, b) => scoreEmail(b.email) - scoreEmail(a.email))[0] || null;
}

async function rpc(name, body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase RPC ${name} ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function youtube(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: youtubeApiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube API ${endpoint} ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function getRecentVideos(channelId) {
  const channel = await youtube('channels', {
    part: 'snippet,contentDetails',
    id: channelId,
    maxResults: '1',
  });
  const item = channel.items?.[0];
  if (!item) throw new Error('YouTube channel not found');

  const uploadsId = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error('YouTube uploads playlist not available');

  const playlist = await youtube('playlistItems', {
    part: 'snippet',
    playlistId: uploadsId,
    maxResults: String(videosPerChannel),
  });

  return {
    channelDescription: String(item.snippet?.description || ''),
    videos: (playlist.items || []).map(v => ({
      videoId: v.snippet?.resourceId?.videoId || '',
      description: String(v.snippet?.description || ''),
    })).filter(v => v.videoId),
  };
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
  let checkedVideos = 0;
  let errorText = null;
  const foundEmails = [];
  const foundLinks = [];

  try {
    const data = await getRecentVideos(row.channel_id);
    for (const email of emails(data.channelDescription)) {
      foundEmails.push({ email, source: `https://www.youtube.com/channel/${row.channel_id}` });
    }
    for (const url of links(data.channelDescription)) {
      foundLinks.push({ kind: kind(url), url, source: 'Public YouTube channel description' });
    }

    for (const video of data.videos) {
      checkedVideos += 1;
      const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
      for (const email of emails(video.description)) foundEmails.push({ email, source: videoUrl });
      for (const url of links(video.description)) {
        foundLinks.push({ kind: kind(url), url, source: `Public YouTube video description: ${videoUrl}` });
      }
      if (foundEmails.length) break;
    }

    if (checkedVideos === 0) throw new Error('No recent public videos returned by YouTube Data API');
  } catch (e) {
    errorText = String(e?.message || e).slice(0, 500);
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
      email_source: best ? `YouTube public data: ${best.source}` : null,
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
