// Survival Tabs — deep recent-video public email enrichment v1.0
// Requires Script Properties: YOUTUBE_API_KEY and INGEST_SECRET
// SAFE: public YouTube API data only. Never guesses emails. Never bypasses CAPTCHA. Never sends outreach.

const ST_DEEP_VIDEO_ENRICHMENT = {
  ENDPOINT: 'https://survivalproject.lovable.app/api/public/youtube-deep-enrichment',
  QUEUE_LIMIT: 20,
  VIDEOS_PER_CHANNEL: 15,
  POST_BATCH_SIZE: 20,
};

function runDeepRecentVideoEmailEnrichment() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('INGEST_SECRET');
  const apiKey = props.getProperty('YOUTUBE_API_KEY');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');
  if (!apiKey) throw new Error('Missing Script Property: YOUTUBE_API_KEY');

  Logger.log('DEEP RECENT-VIDEO ENRICHMENT START');
  const queue = stDeepFetchQueue_(secret, ST_DEEP_VIDEO_ENRICHMENT.QUEUE_LIMIT);
  Logger.log('Qualified missing-email creators this run: ' + queue.length);
  if (!queue.length) {
    Logger.log('Nothing left in deep-video queue.');
    return;
  }

  const uploadPlaylists = stDeepFetchUploadPlaylists_(apiKey, queue.map(r => r.channel_id));
  const results = [];
  let emailsFound = 0;
  let linksFound = 0;
  let videosChecked = 0;

  queue.forEach(row => {
    try {
      const playlistId = uploadPlaylists[row.channel_id];
      if (!playlistId) {
        results.push(stDeepErrorResult_(row, 'Uploads playlist not returned by YouTube API'));
        return;
      }
      const scan = stDeepScanRecentVideoDescriptions_(apiKey, playlistId, ST_DEEP_VIDEO_ENRICHMENT.VIDEOS_PER_CHANNEL);
      videosChecked += scan.checkedVideos;
      linksFound += scan.links.length;
      if (scan.email) emailsFound += 1;
      results.push({
        id: row.id,
        business_email: scan.email || null,
        email_source: scan.emailSource || null,
        external_links: scan.links,
        checked_videos: scan.checkedVideos,
        status: scan.email || scan.links.length ? 'found' : 'no_email_found',
        error: null,
      });
      Logger.log((scan.email ? 'FOUND ' : 'NO EMAIL ') + row.channel_title + ' | videos=' + scan.checkedVideos + (scan.email ? ' | ' + scan.email : ''));
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      results.push(stDeepErrorResult_(row, message));
      Logger.log('ERROR ' + row.channel_title + ': ' + message);
    }
    Utilities.sleep(100);
  });

  let updated = 0;
  for (let start = 0; start < results.length; start += ST_DEEP_VIDEO_ENRICHMENT.POST_BATCH_SIZE) {
    const applied = stDeepPostResults_(secret, results.slice(start, start + ST_DEEP_VIDEO_ENRICHMENT.POST_BATCH_SIZE));
    updated += Number(applied.updated || 0);
  }

  Logger.log('DEEP RECENT-VIDEO ENRICHMENT COMPLETE');
  Logger.log('Creators processed: ' + results.length);
  Logger.log('Recent video descriptions checked: ' + videosChecked);
  Logger.log('Public emails found: ' + emailsFound);
  Logger.log('Public links found: ' + linksFound);
  Logger.log('CRM rows updated: ' + updated);
  Logger.log('Run again to continue with the next qualified creators.');
}

function stDeepFetchQueue_(secret, limit) {
  const response = UrlFetchApp.fetch(ST_DEEP_VIDEO_ENRICHMENT.ENDPOINT + '?limit=' + encodeURIComponent(limit), {
    method: 'get', headers: {'x-ingest-secret': secret}, muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Deep queue failed. HTTP ' + code + ': ' + text.slice(0, 1000));
  const data = JSON.parse(text);
  return Array.isArray(data.rows) ? data.rows : [];
}

function stDeepFetchUploadPlaylists_(apiKey, channelIds) {
  const out = {};
  const uniqueIds = Array.from(new Set((channelIds || []).filter(Boolean)));
  for (let start = 0; start < uniqueIds.length; start += 50) {
    const ids = uniqueIds.slice(start, start + 50);
    const url = 'https://www.googleapis.com/youtube/v3/channels' +
      '?part=contentDetails&id=' + encodeURIComponent(ids.join(',')) +
      '&maxResults=50&key=' + encodeURIComponent(apiKey);
    const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('YouTube channels API failed. HTTP ' + code + ': ' + text.slice(0, 500));
    const data = JSON.parse(text);
    (data.items || []).forEach(item => {
      const playlist = (((item || {}).contentDetails || {}).relatedPlaylists || {}).uploads;
      if (item.id && playlist) out[item.id] = playlist;
    });
    Utilities.sleep(100);
  }
  return out;
}

function stDeepScanRecentVideoDescriptions_(apiKey, playlistId, maxVideos) {
  const url = 'https://www.googleapis.com/youtube/v3/playlistItems' +
    '?part=snippet&playlistId=' + encodeURIComponent(playlistId) +
    '&maxResults=' + encodeURIComponent(Math.min(50, maxVideos)) +
    '&key=' + encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('YouTube playlistItems API failed. HTTP ' + code + ': ' + text.slice(0, 500));
  const data = JSON.parse(text);
  const items = (data.items || []).slice(0, maxVideos);
  const links = [];
  const seenLinks = {};
  const candidates = [];

  items.forEach(item => {
    const snippet = (item || {}).snippet || {};
    const description = String(snippet.description || '');
    const videoId = (((snippet || {}).resourceId || {}).videoId) || '';
    const videoUrl = videoId ? 'https://www.youtube.com/watch?v=' + videoId : null;
    stDeepEmailsFromText_(description).forEach(email => {
      candidates.push({
        email: email,
        sourceUrl: videoUrl,
        score: stDeepEmailScore_(description, email),
      });
    });
    stDeepLinksFromText_(description).forEach(urlValue => {
      if (seenLinks[urlValue]) return;
      seenLinks[urlValue] = true;
      links.push({kind: stDeepLinkKind_(urlValue), url: urlValue, source: videoUrl ? 'Public YouTube video description: ' + videoUrl : 'Public YouTube video description'});
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.length ? candidates[0] : null;
  return {
    checkedVideos: items.length,
    email: best ? best.email : null,
    emailSource: best ? best.sourceUrl : null,
    links: links.slice(0, 60),
  };
}

function stDeepEmailsFromText_(text) {
  const decoded = String(text || '')
    .replace(/&#64;|&#x40;|&commat;/gi, '@')
    .replace(/&#46;|&#x2e;/gi, '.');
  const matches = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = {};
  return matches.map(v => String(v).trim().toLowerCase().replace(/[.,;:)\]]+$/, '')).filter(email => {
    if (!email || seen[email]) return false;
    if (/example\.(com|org|net)$/i.test(email)) return false;
    if (/^(?:noreply|no-reply|donotreply|privacy|legal|abuse)@/i.test(email)) return false;
    if (/@[23]x\.(png|jpe?g|gif|webp|svg|ico)$/i.test(email)) return false;
    if (/\.(png|jpe?g|gif|webp|svg|ico|css|js)$/i.test(email)) return false;
    seen[email] = true;
    return true;
  });
}

function stDeepEmailScore_(description, email) {
  const text = String(description || '').toLowerCase();
  const target = String(email || '').toLowerCase();
  const index = text.indexOf(target);
  const context = index >= 0 ? text.substring(Math.max(0, index - 160), Math.min(text.length, index + target.length + 160)) : text;
  let score = 10;
  if (/business|inquir|sponsor|collab|partnership|brand|media kit|product review|review request/.test(context)) score += 40;
  if (/contact|email|reach me|work with/.test(context)) score += 20;
  if (/affiliate|amazon associate|discount code/.test(text)) score += 5;
  if (/support@|sales@|orders@|customer(service|support)@/.test(target)) score -= 8;
  return score;
}

function stDeepLinksFromText_(text) {
  const raw = String(text || '').match(/https?:\/\/[^\s<>"'\])}]+/gi) || [];
  const seen = {};
  const out = [];
  raw.forEach(value => {
    const url = String(value).replace(/[.,;:!?]+$/, '');
    if (!/^https?:\/\//i.test(url) || seen[url]) return;
    if (/youtube\.com\/watch|youtu\.be\//i.test(url)) return;
    seen[url] = true;
    out.push(url);
  });
  return out;
}

function stDeepLinkKind_(url) {
  const value = String(url || '').toLowerCase();
  if (/amazon\.[^/]+\/shop\//.test(value)) return 'amazon_storefront';
  if (/instagram\.com\//.test(value)) return 'instagram';
  if (/tiktok\.com\//.test(value)) return 'tiktok';
  if (/facebook\.com\//.test(value) || /fb\.com\//.test(value)) return 'facebook';
  if (/linktr\.ee\/|beacons\.ai\/|bio\.site\/|solo\.to\/|campsite\.bio\//.test(value)) return 'link_hub';
  if (/patreon\.com\//.test(value)) return 'patreon';
  return 'website';
}

function stDeepErrorResult_(row, message) {
  return {id: row.id, business_email: null, email_source: null, external_links: [], checked_videos: 0, status: 'error', error: String(message || 'Unknown error').slice(0, 1800)};
}

function stDeepPostResults_(secret, rows) {
  const response = UrlFetchApp.fetch(ST_DEEP_VIDEO_ENRICHMENT.ENDPOINT, {
    method: 'post', contentType: 'application/json', headers: {'x-ingest-secret': secret},
    payload: JSON.stringify({rows: rows}), muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Deep enrichment write failed. HTTP ' + code + ': ' + text.slice(0, 1000));
  return JSON.parse(text);
}
