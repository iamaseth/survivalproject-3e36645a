// Survival Tabs — creator website email enrichment v2.2
// Add this as a NEW Google Apps Script file in the same project.
// Requires the existing candidate-bulk-research.gs helpers.
// ZERO YouTube API calls. Never guesses emails. Never sends outreach.

function runCreatorPublicWebsiteEmailEnrichmentV2() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('PUBLIC WEBSITE EMAIL ENRICHMENT V2.2 START');
  Logger.log('SCRIPT VERSION: 2.2');
  Logger.log('YouTube API calls: 0');

  // Built-in parser self-test. If this says 0, the wrong/stale script is running.
  const selfTest = stSelectCreatorOwnedWebsitesV2_([{url:'https://offgridhermit.com/'}]);
  Logger.log('Parser self-test eligible websites: ' + selfTest.length + ' | ' + selfTest.join(' | '));
  if (selfTest.length !== 1) throw new Error('V2.2 parser self-test failed. Stop before CRM research.');

  const report = fetchCreatorContactReport_(secret);
  const queue = (((report || {}).samples || {}).public_link_research || []);
  const props = PropertiesService.getScriptProperties();
  const doneRaw = props.getProperty('ST_CREATOR_WEB_RESEARCH_DONE_V2') || '[]';
  let done;
  try { done = new Set(JSON.parse(doneRaw)); } catch (e) { done = new Set(); }

  const remaining = queue.filter(row => row && row.id && !done.has(String(row.id)));
  const batch = remaining.slice(0, 6);

  Logger.log('Public-link queue currently: ' + queue.length);
  Logger.log('Already attempted in V2: ' + done.size);
  Logger.log('This run: ' + batch.length);

  let websitesFetched = 0;
  let emailsFound = 0;
  let crmUpdated = 0;

  batch.forEach(row => {
    const id = String(row.id);
    const title = String(row.channel_title || id);
    const links = Array.isArray(row.links) ? row.links : [];
    const websites = stSelectCreatorOwnedWebsitesV2_(links);
    Logger.log('Researching: ' + title + ' | raw links=' + links.length + ' | eligible websites=' + websites.length + (websites.length ? ' | ' + websites.join(' | ') : ''));

    if (!websites.length && links.length) {
      links.slice(0, 3).forEach((item, i) => {
        const original = String((item || {}).url || '');
        const normalized = stNormalizePublicUrlV2_(original);
        Logger.log('  Link ' + (i + 1) + ' raw=' + original + ' | normalized=' + normalized + ' | blocked=' + stIsBlockedResearchUrlV2_(normalized));
      });
    }

    let found = null;
    for (let i = 0; i < websites.length && !found; i++) {
      const result = stResearchWebsiteForPublicEmailV2_(websites[i]);
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
    props.setProperty('ST_CREATOR_WEB_RESEARCH_DONE_V2', JSON.stringify(Array.from(done)));
  });

  Logger.log('PUBLIC WEBSITE EMAIL ENRICHMENT V2.2 COMPLETE');
  Logger.log('Creators attempted this run: ' + batch.length);
  Logger.log('HTTP pages fetched: ' + websitesFetched);
  Logger.log('Public emails found: ' + emailsFound);
  Logger.log('CRM rows updated: ' + crmUpdated);
  Logger.log('YouTube API calls: 0');
  Logger.log('Remaining V2 queue: ' + Math.max(0, remaining.length - batch.length));
}

function resetCreatorPublicWebsiteResearchProgressV2() {
  PropertiesService.getScriptProperties().deleteProperty('ST_CREATOR_WEB_RESEARCH_DONE_V2');
  Logger.log('V2 website research progress reset. No CRM data changed.');
}

function stNormalizePublicUrlV2_(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  // Handle markdown-shaped stored links: [label](https://site/path)
  const openParen = raw.lastIndexOf('](');
  if (raw.charAt(0) === '[' && openParen > 0 && raw.charAt(raw.length - 1) === ')') {
    const inside = raw.substring(openParen + 2, raw.length - 1).trim();
    if (/^https?:\/\//i.test(inside)) raw = inside;
  }

  // Otherwise extract the first http(s) token from wrapper text.
  if (!/^https?:\/\//i.test(raw)) {
    const match = raw.match(/https?:\/\/[^\s<>"']+/i);
    if (match) raw = match[0];
  }

  // Strip markdown/trailing punctuation left over from extraction.
  raw = raw.replace(/[\]\)>,.;:!?]+$/, '');
  return raw;
}

function stIsBlockedResearchUrlV2_(raw) {
  const value = String(raw || '').toLowerCase();
  return /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.com|tiktok\.com|amazon\.|amzn\.to|patreon\.com|udemy\.com|discord\.|bit\.ly|printify\.me)/i.test(value);
}

function stOriginAndHostV2_(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^(https?):\/\/([^\/:?#]+)(?::\d+)?(?:[\/?#]|$)/i);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const originalHost = match[2].toLowerCase();
  const host = originalHost.replace(/^www\./, '');
  if (!host) return null;
  return { host: host, origin: scheme + '://' + originalHost + '/' };
}

function stSelectCreatorOwnedWebsitesV2_(links) {
  const seenHosts = {};
  const out = [];

  (links || []).forEach(item => {
    const raw = stNormalizePublicUrlV2_((item || {}).url);
    if (!/^https?:\/\//i.test(raw)) return;
    if (stIsBlockedResearchUrlV2_(raw)) return;
    const parsed = stOriginAndHostV2_(raw);
    if (!parsed || seenHosts[parsed.host]) return;
    seenHosts[parsed.host] = true;
    out.push(parsed.origin);
  });

  return out.slice(0, 2);
}

function stResearchWebsiteForPublicEmailV2_(baseUrl) {
  const paths = ['', 'contact', 'contact-us', 'about', 'about-us'];
  let fetchCount = 0;

  for (let i = 0; i < paths.length; i++) {
    const url = paths[i] ? baseUrl.replace(/\/$/, '') + '/' + paths[i] : baseUrl;
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalTabsPublicResearch/2.2)' },
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
