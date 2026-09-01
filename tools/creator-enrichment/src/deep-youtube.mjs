const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const ingestSecret = process.env.YOUTUBE_INGEST_SECRET || '';
const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
const maxCreators = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_LIMIT || 5), 500));
const videosPerChannel = Math.max(1, Math.min(Number(process.env.DEEP_YOUTUBE_VIDEOS || 10), 15));
const maxPublicPages = Math.max(1, Math.min(Number(process.env.PUBLIC_LINK_PAGES || 12), 25));

if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
if (!publishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is required');
if (!ingestSecret) throw new Error('YOUTUBE_INGEST_SECRET is required');
if (!youtubeApiKey) throw new Error('YOUTUBE_API_KEY is required');

const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlRx = /https?:\/\/[^\s<>"'\])}]+/gi;
const hrefRx = /href\s*=\s*["']([^"']+)["']/gi;
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

function isSafePublicUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return false;
    if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    return true;
  } catch { return false; }
}

function htmlHrefs(html, base) {
  const out = [];
  for (const m of String(html || '').matchAll(hrefRx)) {
    try {
      const href = new URL(m[1], base).href;
      if (isSafePublicUrl(href)) out.push(href);
    } catch {}
  }
  return uniq(out);
}

function contactLike(url) {
  const s = String(url).toLowerCase();
  return /contact|about|business|collab|sponsor|partner|media|press|work-with|inquir/.test(s);
}

async function fetchPublicPage(url) {
  if (!isSafePublicUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalTabsCreatorResearch/1.0)' },
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) return null;
    const text = (await res.text()).slice(0, 1500000);
    return { url: res.url || url, text };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function enrichFromPublicLinks(seedLinks) {
  const foundEmails = [];
  const discovered = [];
  const queue = uniq(seedLinks.filter(isSafePublicUrl)).slice(0, maxPublicPages);
  const seen = new Set();
  let pagesChecked = 0;

  while (queue.length && pagesChecked < maxPublicPages) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const page = await fetchPublicPage(url);
    if (!page) continue;
    pagesChecked += 1;

    for (const email of emails(page.text)) foundEmails.push({ email, source: page.url });
    const hrefs = htmlHrefs(page.text, page.url);
    for (const href of hrefs) {
      const k = kind(href);
      if (k !== 'website' || contactLike(href)) discovered.push({ kind: k, url: href, source: `Public page: ${page.url}` });
    }

    // Follow only same-site contact/about pages plus link-hub destinations.
    let baseHost = '';
    try { baseHost = new URL(page.url).hostname.replace(/^www\./, ''); } catch {}
    for (const href of hrefs) {
      try {
        const u = new URL(href);
        const sameHost = u.hostname.replace(/^www\./, '') === baseHost;
        if ((sameHost && contactLike(href)) || kind(page.url) === 'link_hub') {
          if (!seen.has(href) && queue.length < maxPublicPages * 2) queue.push(href);
        }
      } catch {}
    }
    if (foundEmails.length) break;
  }
  return { foundEmails, discovered, pagesChecked };
}

async function rpc(name, body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
  const channel = await youtube('channels', { part: 'snippet,contentDetails', id: channelId, maxResults: '1' });
  const item = channel.items?.[0];
  if (!item) throw new Error('YouTube channel not found');
  const uploadsId = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error('YouTube uploads playlist not available');
  const playlist = await youtube('playlistItems', { part: 'snippet', playlistId: uploadsId, maxResults: String(videosPerChannel) });
  return {
    channelDescription: String(item.snippet?.description || ''),
    videos: (playlist.items || []).map(v => ({ videoId: v.snippet?.resourceId?.videoId || '', description: String(v.snippet?.description || '') })).filter(v => v.videoId),
  };
}

const queueResponse = await rpc('youtube_deep_enrichment_queue', { p_secret: ingestSecret, p_limit: maxCreators });
const queue = Array.isArray(queueResponse) ? queueResponse : [];
console.log(`Qualified no-email creators queued: ${queue.length}`);
let checked = 0, emailsAdded = 0, linksFound = 0, pagesChecked = 0, errors = 0;

for (const row of queue) {
  checked += 1;
  const title = row.channel_title || row.channel_id;
  let checkedVideos = 0;
  let errorText = null;
  const foundEmails = [];
  const foundLinks = [];
  try {
    const data = await getRecentVideos(row.channel_id);
    for (const email of emails(data.channelDescription)) foundEmails.push({ email, source: `https://www.youtube.com/channel/${row.channel_id}` });
    for (const url of links(data.channelDescription)) foundLinks.push({ kind: kind(url), url, source: 'Public YouTube channel description' });
    for (const video of data.videos) {
      checkedVideos += 1;
      const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
      for (const email of emails(video.description)) foundEmails.push({ email, source: videoUrl });
      for (const url of links(video.description)) foundLinks.push({ kind: kind(url), url, source: `Public YouTube video description: ${videoUrl}` });
    }
    if (checkedVideos === 0) throw new Error('No recent public videos returned by YouTube Data API');

    if (!foundEmails.length && foundLinks.length) {
      const publicResult = await enrichFromPublicLinks(foundLinks.map(x => x.url));
      pagesChecked += publicResult.pagesChecked;
      foundEmails.push(...publicResult.foundEmails);
      foundLinks.push(...publicResult.discovered);
    }
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
      email_source: best ? `Public creator web research: ${best.source}` : null,
      external_links: uniqueLinks,
      checked_videos: checkedVideos,
      status: best ? 'found' : errorText ? 'error' : 'no_email_found',
      error: errorText,
    }],
  });
  emailsAdded += Number(applied?.emailAdded || 0);
  console.log(`[${checked}/${queue.length}] ${title}: videos=${checkedVideos} email=${best ? best.email : 'none'} links=${uniqueLinks.length}${errorText ? ' ERROR' : ''}`);
}
console.log(JSON.stringify({ checked, emailsAdded, linksFound, publicPagesChecked: pagesChecked, errors }, null, 2));
