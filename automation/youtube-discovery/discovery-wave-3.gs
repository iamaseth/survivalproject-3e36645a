// Survival Tabs — Discovery Wave 3
// Add-only Google Apps Script worker for finding NEW 1K–20K YouTube candidates.
// Does NOT delete, overwrite, promote, contact, or send email.
// Uses Script Property: YOUTUBE_API_KEY
// Writes only new channel IDs to the existing "YouTube Discovery Rebuild" sheet.

const DISCOVERY_WAVE_3 = {
  SHEET_NAME: 'YouTube Discovery Rebuild',
  MIN_SUBSCRIBERS: 1000,
  MAX_SUBSCRIBERS: 20000,
  MIN_VIDEOS: 5,
  SEARCH_RESULTS_PER_TERM: 50,
  // One YouTube Search API page per query. 40 terms ~= 4,000 quota units.
  PUBLISHED_WITHIN_DAYS: 180,
  SEARCH_TERMS: [
    'prepper pantry tour',
    'food storage haul review',
    'emergency food taste test',
    'camping meal review',
    'freeze dried food review',
    'backpacking meal taste test',
    'survival ration review',
    '72 hour bag review',
    'bug out bag loadout',
    'get home bag EDC',
    'EDC pouch review',
    'bushcraft camp cooking',
    'bushcraft gear loadout',
    'homestead pantry tour',
    'homestead food preservation',
    'off grid pantry',
    'off grid homestead tour',
    'self reliance homestead',
    'RV gear review',
    'RV boondocking preparedness',
    'van life gear review',
    'overland gear review',
    'overlanding camp kitchen',
    'hiking gear review',
    'backpacking gear review',
    'camping gear review',
    'outdoor gear review',
    'water filter review camping',
    'portable power station camping review',
    'solar generator camping review',
    'emergency radio review',
    'ham radio portable field day',
    'hurricane prep vlog',
    'storm prep vlog',
    'family preparedness vlog',
    'urban prepper gear',
    'car emergency kit review',
    'vehicle survival kit',
    'Amazon camping gear review',
    'Amazon preparedness gear review'
  ]
};

function runDiscoveryWave3_1000to20000() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  if (!apiKey) throw new Error('Missing Script Property: YOUTUBE_API_KEY');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this Apps Script from the influencer Google Sheet.');
  const sheet = ss.getSheetByName(DISCOVERY_WAVE_3.SHEET_NAME);
  if (!sheet) throw new Error('Missing sheet: ' + DISCOVERY_WAVE_3.SHEET_NAME);

  const headerMap = ensureWave3Headers_(sheet);
  const existingIds = existingChannelIdsWave3_(sheet, headerMap['Channel ID']);
  const seenThisRun = new Set();
  const foundByChannel = new Map();

  const publishedAfter = new Date(Date.now() - DISCOVERY_WAVE_3.PUBLISHED_WITHIN_DAYS * 86400000).toISOString();

  Logger.log('DISCOVERY WAVE 3 START');
  Logger.log('Existing channel IDs in sheet: ' + existingIds.size);
  Logger.log('Search terms: ' + DISCOVERY_WAVE_3.SEARCH_TERMS.length);

  DISCOVERY_WAVE_3.SEARCH_TERMS.forEach((term, index) => {
    Logger.log('Search ' + (index + 1) + '/' + DISCOVERY_WAVE_3.SEARCH_TERMS.length + ': ' + term);

    const url = 'https://www.googleapis.com/youtube/v3/search' +
      '?part=snippet' +
      '&type=video' +
      '&order=relevance' +
      '&maxResults=' + DISCOVERY_WAVE_3.SEARCH_RESULTS_PER_TERM +
      '&publishedAfter=' + encodeURIComponent(publishedAfter) +
      '&relevanceLanguage=en' +
      '&q=' + encodeURIComponent(term) +
      '&key=' + encodeURIComponent(apiKey);

    const data = youtubeJsonWave3_(url);
    (data.items || []).forEach(item => {
      const snippet = item.snippet || {};
      const channelId = String(snippet.channelId || '').trim();
      if (!channelId || existingIds.has(channelId) || seenThisRun.has(channelId)) return;

      seenThisRun.add(channelId);
      foundByChannel.set(channelId, {
        channel_id: channelId,
        channel_title: snippet.channelTitle || '',
        search_term: term,
        matched_video_title: snippet.title || '',
        matched_video_published_at: snippet.publishedAt || ''
      });
    });

    Utilities.sleep(100);
  });

  const candidateIds = Array.from(foundByChannel.keys());
  Logger.log('Unique NEW channels before 1K–20K filtering: ' + candidateIds.length);

  const channelDetails = new Map();
  for (let i = 0; i < candidateIds.length; i += 50) {
    const ids = candidateIds.slice(i, i + 50);
    const url = 'https://www.googleapis.com/youtube/v3/channels' +
      '?part=snippet,statistics' +
      '&id=' + encodeURIComponent(ids.join(',')) +
      '&maxResults=50' +
      '&key=' + encodeURIComponent(apiKey);
    const data = youtubeJsonWave3_(url);
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
    if (stats.hiddenSubscriberCount) return;

    const subscribers = numberOrNullWave3_(stats.subscriberCount);
    const videos = numberOrNullWave3_(stats.videoCount);
    if (subscribers == null) return;
    if (subscribers < DISCOVERY_WAVE_3.MIN_SUBSCRIBERS || subscribers > DISCOVERY_WAVE_3.MAX_SUBSCRIBERS) return;
    if (videos != null && videos < DISCOVERY_WAVE_3.MIN_VIDEOS) return;

    rows.push({
      'Channel ID': channelId,
      'Channel': snippet.title || matched.channel_title || '',
      'Subscribers': subscribers,
      'Videos': videos == null ? '' : videos,
      'Country': snippet.country || '',
      'YouTube URL': 'https://www.youtube.com/channel/' + channelId,
      'Search Term': matched.search_term,
      'Last Upload': matched.matched_video_published_at,
      'Screening Status': 'Wave 3 1K-20K candidate',
      'Screening Reason': 'Active recent match: ' + matched.matched_video_title,
      'Contact Status': 'Needs enrichment'
    });
  });

  rows.sort((a, b) => Number(a['Subscribers']) - Number(b['Subscribers']));
  appendObjectsWave3_(sheet, headerMap, rows);

  Logger.log('DISCOVERY WAVE 3 COMPLETE');
  Logger.log('Raw search result ceiling: ' + (DISCOVERY_WAVE_3.SEARCH_TERMS.length * DISCOVERY_WAVE_3.SEARCH_RESULTS_PER_TERM));
  Logger.log('Unique new channels found before filtering: ' + candidateIds.length);
  Logger.log('New 1K–20K candidates appended: ' + rows.length);
  Logger.log('Existing rows were preserved. Nothing was deleted or overwritten.');
  Logger.log('NEXT: review/filter Wave 3 rows before sending them to CRM.');
}

function youtubeJsonWave3_(url) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('YouTube API HTTP ' + code + ': ' + text.slice(0, 500));
  }
  return JSON.parse(text);
}

function ensureWave3Headers_(sheet) {
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

function existingChannelIdsWave3_(sheet, channelIdColumn) {
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

function appendObjectsWave3_(sheet, headerMap, objects) {
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

function numberOrNullWave3_(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}
