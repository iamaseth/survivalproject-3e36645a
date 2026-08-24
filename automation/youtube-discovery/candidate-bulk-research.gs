// Survival Tabs — bulk candidate research worker
// Add this as a separate Google Apps Script file in the existing influencer Sheet project.
// Required Script Properties: YOUTUBE_API_KEY and INGEST_SECRET
//
// SAFE / ADD-ONLY:
// - never sends outreach
// - never Keeps, Skips, deletes, or promotes candidates
// - safe classification only touches previously UNCLASSIFIED pending candidates
// - enrichment only uses publicly available data
// - never guesses an email or bypasses CAPTCHA/business-email gating

const ST_CANDIDATE_BULK_RESEARCH = {
  ENRICHMENT_ENDPOINT: 'https://survivalproject.lovable.app/api/public/youtube-enrichment',
  CONTACT_QUEUE_ENDPOINT: 'https://survivalproject.lovable.app/api/public/creator-contact-queue',
  QUEUE_LIMIT: 250,
  MAX_ROUNDS: 8,
  POST_BATCH_SIZE: 100,
  WEB_RESEARCH_PER_RUN: 6,
  WEB_FETCH_TIMEOUT_NOTE: 'Apps Script UrlFetchApp controls request timeout internally',
};

function runSafeClassificationFirstPass() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('SAFE CLASSIFICATION FIRST PASS START');
  const response = UrlFetchApp.fetch(ST_CANDIDATE_BULK_RESEARCH.ENRICHMENT_ENDPOINT, {
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

  for (let round = 1; round <= ST_CANDIDATE_BULK_RESEARCH.MAX_ROUNDS; round++) {
    const queue = fetchEnrichmentQueue_(secret, ST_CANDIDATE_BULK_RESEARCH.QUEUE_LIMIT);
    Logger.log('Round ' + round + ': queue rows ' + queue.length);
    if (!queue.length) break;
    totalRead += queue.length;

    const details = fetchChannelDescriptions_(apiKey, queue.map(row => row.channel_id));
    const results = queue.map(row => buildPublicDescriptionResult_(row, details.get(row.channel_id)));

    for (let start = 0; start < results.length; start += ST_CANDIDATE_BULK_RESEARCH.POST_BATCH_SIZE) {
      const batch = results.slice(start, start + ST_CANDIDATE_BULK_RESEARCH.POST_BATCH_SIZE);
      const applied = postEnrichmentBatch_(secret, batch);
      totalUpdated += Number(applied.updated || 0);
      totalEmails += Number(applied.emailAdded || 0);
      totalLinks += Number(applied.linksAdded || 0);
      totalMissing += Number(applied.missing || 0);
      Logger.log(
        'Round ' + round + ' batch ' + (Math.floor(start / ST_CANDIDATE_BULK_RESEARCH.POST_BATCH_SIZE) + 1) +
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
}

/** Read-only contact queue report. ZERO YouTube API calls and ZERO CRM writes. */
function runCreatorContactQueueReport() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('CREATOR CONTACT QUEUE REPORT START');
  Logger.log('YouTube API calls: 0');
  Logger.log('CRM writes: 0');

  const data = fetchCreatorContactReport_(secret);
  Logger.log('CREATOR CONTACT QUEUE REPORT COMPLETE');
  Logger.log('Classified creators examined: ' + Number(data.examined || 0));
  Logger.log('Already contactable: ' + Number(data.already_contactable || 0));
  Logger.log('Public-link research queue: ' + Number(data.public_link_research || 0));
  Logger.log('External research queue: ' + Number(data.external_research || 0));
  Logger.log('Recommended now: ' + Number(data.recommended_now || 0));
  Logger.log('YouTube API calls: ' + Number(data.youtube_api_calls || 0));
  Logger.log('CRM writes: ' + Number(data.crm_writes || 0));
}

/**
 * Searches public creator-owned websites already present in CRM for a published email.
 * ZERO YouTube API calls. Does NOT web-search for new sites.
 * Processes at most 6 creator records per run to stay within Apps Script execution time.
 * Progress is stored in Script Properties so repeated runs continue rather than repeat.
 * Only verified emails found in fetched public HTML are written to CRM.
 */
function runCreatorPublicWebsiteEmailEnrichment() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('PUBLIC WEBSITE EMAIL ENRICHMENT START');
  Logger.log('YouTube API calls: 0');

  const report = fetchCreatorContactReport_(secret);
  const queue = (((report || {}).samples || {}).public_link_research || []);
  const props = PropertiesService.getScriptProperties();
  const doneRaw = props.getProperty('ST_CREATOR_WEB_RESEARCH_DONE') || '[]';
  let done;
  try { done = new Set(JSON.parse(doneRaw)); } catch (e) { done = new Set(); }

  const remaining = queue.filter(row => row && row.id && !done.has(String(row.id)));
  const batch = remaining.slice(0, ST_CANDIDATE_BULK_RESEARCH.WEB_RESEARCH_PER_RUN);

  Logger.log('Public-link queue currently: ' + queue.length);
  Logger.log('Already attempted locally: ' + done.size);
  Logger.log('This run: ' + batch.length);

  let websitesFetched = 0;
  let emailsFound = 0;
  let crmUpdated = 0;

  batch.forEach(row => {
    const id = String(row.id);
    const title = String(row.channel_title || id);
    const links = Array.isArray(row.links) ? row.links : [];
    const websites = selectCreatorOwnedWebsites_(links);
    Logger.log('Researching: ' + title + ' | eligible websites=' + websites.length);

    let found = null;
    for (let i = 0; i < websites.length && !found; i++) {
      const result = researchWebsiteForPublicEmail_(websites[i]);
      websitesFetched += result.fetchCount;
      if (result.email) found = result;
    }

    if (found && found.email && found.sourceUrl) {
      const applied = postEnrichmentBatch_(secret, [{
        id: id,
        business_email: found.email,
        email_source: found.sourceUrl,
        external_links: [],
        status: 'found',
        error: null,
      }]);
      emailsFound += 1;
      crmUpdated += Number(applied.updated || 0);
      Logger.log('FOUND ' + title + ': ' + found.email + ' @ ' + found.sourceUrl);
    } else {
      Logger.log('No public website email found: ' + title);
    }

    done.add(id);
    props.setProperty('ST_CREATOR_WEB_RESEARCH_DONE', JSON.stringify(Array.from(done)));
  });

  Logger.log('PUBLIC WEBSITE EMAIL ENRICHMENT COMPLETE');
  Logger.log('Creators attempted this run: ' + batch.length);
  Logger.log('HTTP pages fetched: ' + websitesFetched);
  Logger.log('Public emails found: ' + emailsFound);
  Logger.log('CRM rows updated: ' + crmUpdated);
  Logger.log('YouTube API calls: 0');
  Logger.log('Remaining local queue: ' + Math.max(0, remaining.length - batch.length));
  Logger.log('Run again until Remaining local queue is 0.');
}

function resetCreatorPublicWebsiteResearchProgress() {
  PropertiesService.getScriptProperties().deleteProperty('ST_CREATOR_WEB_RESEARCH_DONE');
  Logger.log('Creator public website research progress reset. No CRM data changed.');
}

function fetchCreatorContactReport_(secret) {
  const response = UrlFetchApp.fetch(ST_CANDIDATE_BULK_RESEARCH.CONTACT_QUEUE_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ action: 'creator_contact_queue_report', limit: 2000 }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Contact queue report failed. HTTP ' + code + ': ' + text);
  return JSON.parse(text);
}

function selectCreatorOwnedWebsites_(links) {
  const blocked = /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.com|tiktok\.com|amazon\.|amzn\.to|patreon\.com|udemy\.com|discord\.|bit\.ly|printify\.me)/i;
  const seenHosts = new Set();
  const out = [];
  (links || []).forEach(item => {
    const raw = String((item || {}).url || '').trim();
    if (!/^https?:\/\//i.test(raw) || blocked.test(raw)) return;
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      if (!host || seenHosts.has(host)) return;
      seenHosts.add(host);
      out.push(u.origin + '/');
    } catch (e) {}
  });
  return out.slice(0, 2);
}

function researchWebsiteForPublicEmail_(baseUrl) {
  const paths = ['', 'contact', 'contact-us', 'about', 'about-us'];
  let fetchCount = 0;
  for (let i = 0; i < paths.length; i++) {
    const url = paths[i] ? baseUrl.replace(/\/$/, '') + '/' + paths[i] : baseUrl;
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalTabsPublicResearch/1.0)' },
      });
      fetchCount += 1;
      const code = response.getResponseCode();
      if (code < 200 || code >= 400) continue;
      const html = response.getContentText();
      const emails = publicEmailsFromText_(html);
      if (emails.length) return { email: emails[0], sourceUrl: url, fetchCount: fetchCount };
    } catch (e) {
      fetchCount += 1;
    }
  }
  return { email: null, sourceUrl: null, fetchCount: fetchCount };
}

function fetchEnrichmentQueue_(secret, limit) {
  const response = UrlFetchApp.fetch(
    ST_CANDIDATE_BULK_RESEARCH.ENRICHMENT_ENDPOINT + '?limit=' + encodeURIComponent(limit),
    { method: 'get', headers: { 'x-ingest-secret': secret }, muteHttpExceptions: true }
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
      '?part=snippet&id=' + encodeURIComponent(ids.join(',')) +
      '&maxResults=50&key=' + encodeURIComponent(apiKey);
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
    return { id: queueRow.id, business_email: null, email_source: null, external_links: [], status: 'error', error: 'YouTube channel details not returned' };
  }
  const description = String(((channelItem || {}).snippet || {}).description || '');
  const emails = publicEmailsFromText_(description);
  const links = publicLinksFromText_(description).map(url => ({ kind: publicLinkKind_(url), url: url, source: 'Public YouTube channel description' }));
  return { id: queueRow.id, business_email: emails.length ? emails[0] : null, email_source: emails.length ? channelUrl : null, external_links: links, status: emails.length || links.length ? 'found' : 'no_email_found', error: null };
}

function publicEmailsFromText_(text) {
  const decoded = String(text || '')
    .replace(/&#64;|&#x40;|&commat;/gi, '@')
    .replace(/&#46;|&#x2e;/gi, '.');
  const matches = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set();
  const out = [];
  matches.forEach(raw => {
    const email = String(raw).trim().toLowerCase().replace(/[.,;:)\]]+$/, '');
    if (!email || seen.has(email)) return;
    if (/example\.(com|org|net)$/i.test(email)) return;
    if (/^(?:noreply|no-reply|donotreply)@/i.test(email)) return;
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
    seen.add(url); out.push(url);
  });
  return out.slice(0, 30);
}

function publicLinkKind_(url) {
  const value = String(url || '').toLowerCase();
  if (/amazon\.[^/]+\/shop\//.test(value)) return 'amazon_storefront';
  if (/instagram\.com\//.test(value)) return 'instagram';
  if (/tiktok\.com\//.test(value)) return 'tiktok';
  if (/facebook\.com\//.test(value) || /fb\.com\//.test(value)) return 'facebook';
  if (/linktr\.ee\//.test(value) || /beacons\.ai\//.test(value) || /bio\.site\//.test(value)) return 'link_hub';
  return 'website';
}

function postEnrichmentBatch_(secret, rows) {
  const response = UrlFetchApp.fetch(ST_CANDIDATE_BULK_RESEARCH.ENRICHMENT_ENDPOINT, {
    method: 'post', contentType: 'application/json', headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ rows: rows }), muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Enrichment batch failed. HTTP ' + code + ': ' + text);
  return JSON.parse(text);
}
