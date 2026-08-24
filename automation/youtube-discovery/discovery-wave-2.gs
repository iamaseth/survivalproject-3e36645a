// Survival Tabs — Discovery Wave 2
// Add-only Google Apps Script worker for finding NEW <=20K YouTube candidates.
// Does NOT delete, overwrite, promote, contact, or send email.
// Uses Script Property: YOUTUBE_API_KEY
// Writes only new channel IDs to the existing "YouTube Discovery Rebuild" sheet.

const DISCOVERY_WAVE_2 = {
  SHEET_NAME: 'YouTube Discovery Rebuild',
  MAX_SUBSCRIBERS: 20000,
  SEARCH_RESULTS_PER_TERM: 50,
  // Keep this at 1 page per query. Search.list costs 100 quota units per call.
  // 30 terms ~= 3,000 quota units plus inexpensive channel lookups.
  PUBLISHED_WITHIN_DAYS: 180,
  SEARCH_TERMS: [
    'prepper emergency food review',
    'emergency food storage prepper',
    '72 hour kit preparedness',
    'bug out bag food gear',
    'go bag emergency preparedness',
    'survival food review',
    'survival gear review small channel',
    'EDC emergency preparedness',
    'EDC gear review survival',
    'bushcraft gear review',
    'bushcraft food camp cooking',
    'camping gear review small channel',
    'backpacking food review',
    'hiking emergency gear',
    'homestead preparedness food storage',
    'homesteading emergency preparedness',
    'off grid preparedness',
    'off grid food storage',
    'family emergency preparedness',
    'urban preparedness prepper',
    'vehicle emergency kit',
    'car emergency preparedness gear',
    'RV emergency preparedness',
    'van life emergency gear',
    'overlanding emergency gear',
    'hurricane preparedness kit',
    'storm preparedness emergency food',
    'ham radio emergency preparedness',
    'Amazon gear reviews camping survival',
    'Amazon influencer EDC survival gear'
  ]
};

function runDiscoveryWave2_1000Goal() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  if (!apiKey) throw new Error('Missing Script Property: YOUTUBE_API_KEY');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this Apps Script from the influencer Google Sheet.');
  const sheet = ss.getSheetByName(DISCOVERY_WAVE_2.SHEET_NAME);
  if (!sheet) throw new Error('Missing sheet: ' + DISCOVERY_WAVE_2.SHEET_NAME);

  const headerMap = ensureWave2Headers_(sheet);
  const existingIds = existingChannelIds_(sheet, headerMap['Channel ID']);
  const seenThisRun = new Set();
  const foundByChannel = new Map();

  const publishedAfter = new Date(Date.now() - DISCOVERY_WAVE_2.PUBLISHED_WITHIN_DAYS * 86400000).toISOString();

  Logger.log('DISCOVERY WAVE 2 START');
  Logger.log('Existing channel IDs in sheet: ' + existingIds.size);
  Logger.log('Search terms: ' + DISCOVERY_WAVE_2.SEARCH_TERMS.length);

  DISCOVERY_WAVE_2.SEARCH_TERMS.forEach((term, index) => {
    Logger.log('Search ' + (index + 1) + '/' + DISCOVERY_WAVE_2.SEARCH_TERMS.length + ': ' + term);

    const url = 'https://www.googleapis.com/youtube/v3/search' +
      '?part=snippet' +
      '&type=video' +
      '&order=relevance' +
      '&maxResults=' + DISCOVERY_WAVE_2.SEARCH_RESULTS_PER_TERM +
      '&publishedAfter=' + encodeURIComponent(publishedAfter) +
      '&q=' + encodeURIComponent(term) +
      '&key=' + encodeURIComponent(apiKey);

    const data = youtubeJson_(url);
    (data.items || []).forEach(item => {
      const snippet = item.snippet || {};
      const channelId = String(snippet.channelId || '').trim();
      if (!channelId || existingIds.has(channelId)) return;

      if (!seenThisRun.has(channelId)) {
        seenThisRun.add(channelId);
        foundByChannel.set(channelId, {
          channel_id: channelId,
          channel_title: snippet.channelTitle || '',
          search_term: term,
          matched_video_title: snippet.title || '',
          matched_video_published_at: snippet.publishedAt || ''
        });
      }
    });

    Utilities.sleep(100);
  });

  const candidateIds = Array.from(foundByChannel.keys());
  Logger.log('Unique NEW channels before <=20K filtering: ' + candidateIds.length);

  const channelDetails = new Map();
  for (let i = 0; i < candidateIds.length; i += 50) {
    const ids = candidateIds.slice(i, i + 50);
    const url = 'https://www.googleapis.com/youtube/v3/channels' +
      '?part=snippet,statistics' +
      '&id=' + encodeURIComponent(ids.join(',')) +
      '&maxResults=50' +
      '&key=' + encodeURIComponent(apiKey);
    const data = youtubeJson_(url);
    (data.items || []).forEach(item => channelDetails.set(item.id, item));
    Utilities.sleep(100);
  }

  const rows = [];
  candidateIds.forEach(channelId => {
    const matched = foundByChannel.get(channelId);
    const detail = channelDetails.get(channelId);
    if (!matched || !detail) return;

    const stats = detail.statistics || {};
    const snippet = detail.snippet || {};
    const hidden = !!stats.hiddenSubscriberCount;
    const subscribers = hidden ? null : numberOrNullWave2_(stats.subscriberCount);
    const videos = numberOrNullWave2_(stats.videoCount);

    // Hidden subscriber counts are retained for research instead of falsely assuming <=20K.
    if (subscribers != null && subscribers > DISCOVERY_WAVE_2.MAX_SUBSCRIBERS) return;

    rows.push({
      'Channel ID': channelId,
      'Channel': snippet.title || matched.channel_title || '',
      'Subscribers': subscribers == null ? '' : subscribers,
      'Videos': videos == null ? '' : videos,
      'Country': snippet.country || '',
      'YouTube URL': 'https://www.youtube.com/channel/' + channelId,
      'Search Term': matched.search_term,
      'Last Upload': matched.matched_video_published_at,
      'Screening Status': subscribers == null ? 'Needs subscriber review' : 'Wave 2 <=20K candidate',
      'Screening Reason': 'Discovered from recent video: ' + matched.matched_video_title,
      'Contact Status': 'Needs enrichment'
    });
  });

  rows.sort((a, b) => {
    const as = Number(a['Subscribers'] || 999999);
    const bs = Number(b['Subscribers'] || 999999);
    return as - bs;
  });

  appendObjectsWave2_(sheet, headerMap, rows);

  Logger.log('DISCOVERY WAVE 2 COMPLETE');
  Logger.log('Raw search results maximum: ' + (DISCOVERY_WAVE_2.SEARCH_TERMS.length * DISCOVERY_WAVE_2.SEARCH_RESULTS_PER_TERM));
  Logger.log('Unique new channels found: ' + candidateIds.length);
  Logger.log('New <=20K/hidden-sub candidates appended: ' + rows.length);
  Logger.log('Existing rows were preserved. Nothing was deleted or overwritten.');
  Logger.log('NEXT: review the new rows, then run sendExistingResultsToCRM() to stage them in CRM. The CRM deduplicates existing channel IDs.');
}

function youtubeJson_(url) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('YouTube API HTTP ' + code + ': ' + text.slice(0, 500));
  }
  return JSON.parse(text);
}

function ensureWave2Headers_(sheet) {
  const required = [
    'Channel ID', 'Channel', 'Subscribers', 'Videos', 'Country', 'YouTube URL',
    'Search Term', 'Last Upload', 'Screening Status', 'Screening Reason', 'Contact Status'
  ];

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(v => String(v || '').trim());
  if (headers.every(h => !h)) headers = [];

  required.forEach(name => {
    if (headers.indexOf(name) === -1) headers.push(name);
  });

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const map = {};
  headers.forEach((h, i) => { if (h) map[h] = i + 1; });
  return map;
}

function existingChannelIds_(sheet, channelIdColumn) {
  const out = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  const values = sheet.getRange(2, channelIdColumn, lastRow - 1, 1).getDisplayValues();
  values.forEach(row => {
    const id = String(row[0] || '').trim();
    if (id) out.add(id);
  });
  return out;
}

function appendObjectsWave2_(sheet, headerMap, objects) {
  if (!objects.length) return;
  const headers = Object.keys(headerMap).sort((a, b) => headerMap[a] - headerMap[b]);
  const width = headers.length;
  const values = objects.map(obj => {
    const row = new Array(width).fill('');
    Object.keys(obj).forEach(key => {
      const col = headerMap[key];
      if (col) row[col - 1] = obj[key];
    });
    return row;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, width).setValues(values);
}

function numberOrNullWave2_(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}
