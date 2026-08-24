// Survival Tabs — bulk candidate research worker
// Add this as a separate Google Apps Script file in the existing influencer Sheet project.
// Required Script Properties: YOUTUBE_API_KEY and INGEST_SECRET
//
// SAFE / ADD-ONLY:
// - never sends outreach
// - never Keeps, Skips, deletes, or promotes candidates
// - safe classification only touches previously UNCLASSIFIED pending candidates
// - enrichment only uses email/URLs written publicly in YouTube channel descriptions
// - never guesses an email or bypasses YouTube CAPTCHA/business-email gating

const CANDIDATE_BULK_RESEARCH = {
  ENRICHMENT_ENDPOINT: 'https://survivalproject.lovable.app/api/public/youtube-enrichment',
  QUEUE_LIMIT: 250,
  MAX_ROUNDS: 8,
  POST_BATCH_SIZE: 100,
};

function runSafeClassificationFirstPass() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('SAFE CLASSIFICATION FIRST PASS START');
  const response = UrlFetchApp.fetch(CANDIDATE_BULK_RESEARCH.ENRICHMENT_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ action: 'safe_classification_first_pass', limit: 2000 }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  Logger.log('Response: ' + code + ' ' + text);
  if (code < 200 || code >= 300) throw new Error('Classification failed. HTTP ' + code + ': ' + text);

  const data = JSON.parse(text);
  Logger.log('SAFE CLASSIFICATION FIRST PASS COMPLETE');
  Logger.log('Unclassified candidates examined: ' + Number(data.examined || 0));
  Logger.log('Creators auto-classified: ' + Number(data.creator || 0));
  Logger.log('Brands/companies auto-classified: ' + Number(data.brand_company || 0));
  Logger.log('Competitors auto-classified: ' + Number(data.competitor || 0));
  Logger.log('Organizations auto-classified: ' + Number(data.organization || 0));
  Logger.log('Left for research: ' + Number(data.left_for_review || 0));
  Logger.log('Previously classified preserved: ' + Number(data.already_classified || 0));
}

function runPublicYouTubeDescriptionEnrichment() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  const apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');
  if (!apiKey) throw new Error('Missing Script Property: YOUTUBE_API_KEY');

  Logger.log('PUBLIC YOUTUBE DESCRIPTION ENRICHMENT START');
  let totalRead = 0;
  let totalUpdated = 0;
  let totalEmails = 0;
  let totalLinks = 0;
  let totalMissing = 0;

  for (let round = 1; round <= CANDIDATE_BULK_RESEARCH.MAX_ROUNDS; round++) {
    const queue = fetchEnrichmentQueue_(secret, CANDIDATE_BULK_RESEARCH.QUEUE_LIMIT);
    Logger.log('Round ' + round + ': queue rows ' + queue.length);
    if (!queue.length) break;
    totalRead += queue.length;

    const details = fetchChannelDescriptions_(apiKey, queue.map(row => row.channel_id));
    const results = queue.map(row => buildPublicDescriptionResult_(row, details.get(row.channel_id)));

    for (let start = 0; start < results.length; start += CANDIDATE_BULK_RESEARCH.POST_BATCH_SIZE) {
      const batch = results.slice(start, start + CANDIDATE_BULK_RESEARCH.POST_BATCH_SIZE);
      const applied = postEnrichmentBatch_(secret, batch);
      totalUpdated += Number(applied.updated || 0);
      totalEmails += Number(applied.emailAdded || 0);
      totalLinks += Number(applied.linksAdded || 0);
      totalMissing += Number(applied.missing || 0);
      Logger.log(
        'Round ' + round + ' batch ' + (Math.floor(start / CANDIDATE_BULK_RESEARCH.POST_BATCH_SIZE) + 1) +
        ': updated=' + Number(applied.updated || 0) +
        ' emails=' + Number(applied.emailAdded || 0) +
        ' links=' + Number(applied.linksAdded || 0) +
        ' missing=' + Number(applied.missing || 0)
      );
    }

    Utilities.sleep(200);
  }

  Logger.log('PUBLIC YOUTUBE DESCRIPTION ENRICHMENT COMPLETE');
  Logger.log('Queue rows researched: ' + totalRead);
  Logger.log('CRM rows updated: ' + totalUpdated);
  Logger.log('Public emails added: ' + totalEmails);
  Logger.log('Public links added: ' + totalLinks);
  Logger.log('Unmatched CRM IDs: ' + totalMissing);
  Logger.log('NEXT: refresh /creators. Remaining Needs review can go to Perplexity/manual research.');
}

/**
 * Read-only report for classified Creator candidates.
 * ZERO YouTube API calls and ZERO CRM writes.
 */
function runCreatorContactQueueReport() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  const endpoint = 'https://survivalproject.lovable.app/api/public/creator-contact-queue';

  Logger.log('CREATOR CONTACT QUEUE REPORT START');
  Logger.log('YouTube API calls: 0');
  Logger.log('CRM writes: 0');

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ action: 'creator_contact_queue_report', limit: 2000 }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  Logger.log('Response: ' + code + ' ' + text);
  if (code < 200 || code >= 300) {
    throw new Error('Contact queue report failed safely. HTTP ' + code + ': ' + text);
  }

  const data = JSON.parse(text);
  Logger.log('CREATOR CONTACT QUEUE REPORT COMPLETE');
  Logger.log('Classified creators examined: ' + Number(data.examined || 0));
  Logger.log('Already contactable: ' + Number(data.already_contactable || 0));
  Logger.log('Public-link research queue: ' + Number(data.public_link_research || 0));
  Logger.log('External research queue: ' + Number(data.external_research || 0));
  Logger.log('Recommended now: ' + Number(data.recommended_now || 0));
  Logger.log('YouTube API calls: ' + Number(data.youtube_api_calls || 0));
  Logger.log('CRM writes: ' + Number(data.crm_writes || 0));
}

function fetchEnrichmentQueue_(secret, limit) {
  const response = UrlFetchApp.fetch(
    CANDIDATE_BULK_RESEARCH.ENRICHMENT_ENDPOINT + '?limit=' + encodeURIComponent(limit),
    {
      method: 'get',
      headers: { 'x-ingest-secret': secret },
      muteHttpExceptions: true,
    }
  );
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Queue read failed. HTTP ' + code + ': ' + text);
  const data = JSON.parse(text);
  return Array.isArray(data.rows) ? data.rows : [];
}

function fetchChannelDescriptions_(apiKey, channelIds) {
  const out = new Map();
  const uniqueIds = Array.from(new Set(channelIds.filter(Boolean)));
  for (let start = 0; start < uniqueIds.length; start += 50) {
    const ids = uniqueIds.slice(start, start + 50);
    const url = 'https://www.googleapis.com/youtube/v3/channels' +
      '?part=snippet' +
      '&id=' + encodeURIComponent(ids.join(',')) +
      '&maxResults=50' +
      '&key=' + encodeURIComponent(apiKey);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('YouTube channels API failed. HTTP ' + code + ': ' + text.slice(0, 500));
    const data = JSON.parse(text);
    (data.items || []).forEach(item => out.set(item.id, item));
    Utilities.sleep(100);
  }
  return out;
}

function buildPublicDescriptionResult_(queueRow, channelItem) {
  const channelUrl = queueRow.channel_url || ('https://www.youtube.com/channel/' + queueRow.channel_id);
  if (!channelItem) {
    return {
      id: queueRow.id,
      business_email: null,
      email_source: null,
      external_links: [],
      status: 'error',
      error: 'YouTube channel details not returned',
    };
  }

  const snippet = channelItem.snippet || {};
  const description = String(snippet.description || '');
  const emails = publicEmailsFromText_(description);
  const links = publicLinksFromText_(description).map(url => ({
    kind: publicLinkKind_(url),
    url: url,
    source: 'Public YouTube channel description',
  }));

  return {
    id: queueRow.id,
    business_email: emails.length ? emails[0] : null,
    email_source: emails.length ? channelUrl : null,
    external_links: links,
    status: emails.length || links.length ? 'found' : 'no_email_found',
    error: null,
  };
}

function publicEmailsFromText_(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set();
  const out = [];
  matches.forEach(raw => {
    const email = String(raw).trim().toLowerCase().replace(/[.,;:)\]]+$/, '');
    if (!email || seen.has(email)) return;
    if (/example\.(com|org|net)$/i.test(email)) return;
    seen.add(email);
    out.push(email);
  });
  return out;
}

function publicLinksFromText_(text) {
  const raw = String(text || '').match(/https?:\/\/[^\s<>"'\])}]+/gi) || [];
  const seen = new Set();
  const out = [];
  raw.forEach(value => {
    const url = String(value).replace(/[.,;:!?]+$/, '');
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  });
  return out.slice(0, 30);
}

function publicLinkKind_(url) {
  const value = String(url || '').toLowerCase();
  if (/amazon\.com\/shop\//.test(value)) return 'amazon_storefront';
  if (/instagram\.com\//.test(value)) return 'instagram';
  if (/tiktok\.com\//.test(value)) return 'tiktok';
  if (/facebook\.com\//.test(value) || /fb\.com\//.test(value)) return 'facebook';
  if (/linktr\.ee\//.test(value) || /beacons\.ai\//.test(value) || /bio\.site\//.test(value)) return 'link_hub';
  return 'website';
}

function postEnrichmentBatch_(secret, rows) {
  const response = UrlFetchApp.fetch(CANDIDATE_BULK_RESEARCH.ENRICHMENT_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Enrichment batch failed. HTTP ' + code + ': ' + text);
  return JSON.parse(text);
}
