// Survival Tabs — creator website email enrichment v2.3
// Add this as a NEW Google Apps Script file in the same project.
// Requires the existing candidate-bulk-research.gs helpers.
// ZERO YouTube API calls. Never guesses emails. Never sends outreach.

function runCreatorPublicWebsiteEmailEnrichmentV2() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('PUBLIC WEBSITE EMAIL ENRICHMENT V2.3 START');
  Logger.log('SCRIPT VERSION: 2.3');
  Logger.log('YouTube API calls: 0');

  const selfTest = stSelectCreatorOwnedWebsitesV2_([{url:'https://offgridhermit.com/'}], 'The Off Grid Hermit');
  Logger.log('Parser self-test eligible websites: ' + selfTest.length + ' | ' + selfTest.join(' | '));
  if (selfTest.length !== 1) throw new Error('V2.3 parser self-test failed. Stop before CRM research.');

  const report = fetchCreatorContactReport_(secret);
  const queue = (((report || {}).samples || {}).public_link_research || []);
  const props = PropertiesService.getScriptProperties();
  const doneRaw = props.getProperty('ST_CREATOR_WEB_RESEARCH_DONE_V23') || '[]';
  let done;
  try { done = new Set(JSON.parse(doneRaw)); } catch (e) { done = new Set(); }

  const remaining = queue.filter(row => row && row.id && !done.has(String(row.id)));
  const batch = remaining.slice(0, 6);

  Logger.log('Public-link queue currently: ' + queue.length);
  Logger.log('Already attempted in V2.3: ' + done.size);
  Logger.log('This run: ' + batch.length);

  let websitesFetched = 0;
  let emailsFound = 0;
  let crmUpdated = 0;
  let placeholdersRejected = 0;

  batch.forEach(row => {
    const id = String(row.id);
    const title = String(row.channel_title || id);
    const links = Array.isArray(row.links) ? row.links : [];
    const websites = stSelectCreatorOwnedWebsitesV2_(links, title);
    Logger.log('Researching: ' + title + ' | raw links=' + links.length + ' | eligible creator-owned websites=' + websites.length + (websites.length ? ' | ' + websites.join(' | ') : ''));

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
      placeholdersRejected += Number(result.placeholdersRejected || 0);
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
      Logger.log('No verified public creator email found: ' + title);
    }

    done.add(id);
    props.setProperty('ST_CREATOR_WEB_RESEARCH_DONE_V23', JSON.stringify(Array.from(done)));
  });

  Logger.log('PUBLIC WEBSITE EMAIL ENRICHMENT V2.3 COMPLETE');
  Logger.log('Creators attempted this run: ' + batch.length);
  Logger.log('HTTP pages fetched: ' + websitesFetched);
  Logger.log('Placeholder/example emails rejected: ' + placeholdersRejected);
  Logger.log('Public emails found: ' + emailsFound);
  Logger.log('CRM rows updated: ' + crmUpdated);
  Logger.log('YouTube API calls: 0');
  Logger.log('Remaining V2.3 queue: ' + Math.max(0, remaining.length - batch.length));
}

function resetCreatorPublicWebsiteResearchProgressV2() {
  PropertiesService.getScriptProperties().deleteProperty('ST_CREATOR_WEB_RESEARCH_DONE_V23');
  Logger.log('V2.3 website research progress reset. No CRM data changed.');
}

function stNormalizePublicUrlV2_(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  const openParen = raw.lastIndexOf('](');
  if (raw.charAt(0) === '[' && openParen > 0 && raw.charAt(raw.length - 1) === ')') {
    const inside = raw.substring(openParen + 2, raw.length - 1).trim();
    if (/^https?:\/\//i.test(inside)) raw = inside;
  }
  if (!/^https?:\/\//i.test(raw)) {
    const match = raw.match(/https?:\/\/[^\s<>"']+/i);
    if (match) raw = match[0];
  }
  return raw.replace(/[\]\)>,.;:!?]+$/, '');
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

function stCreatorTitleTokensV2_(title) {
  const stop = {the:1,and:1,with:1,from:1,this:1,that:1,official:1,channel:1,outdoors:1,outdoor:1,survival:1,prepper:1,prepping:1,gear:1,homestead:1,homesteading:1,edc:1};
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter(t => t.length >= 4 && !stop[t]);
}

function stHostMatchesCreatorV2_(host, title) {
  const normalizedHost = String(host || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const titleCompact = String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (titleCompact.length >= 6 && normalizedHost.indexOf(titleCompact) >= 0) return true;
  const tokens = stCreatorTitleTokensV2_(title);
  return tokens.some(t => normalizedHost.indexOf(t) >= 0);
}

function stSelectCreatorOwnedWebsitesV2_(links, title) {
  const seenHosts = {};
  const out = [];
  (links || []).forEach(item => {
    const raw = stNormalizePublicUrlV2_((item || {}).url);
    if (!/^https?:\/\//i.test(raw)) return;
    if (stIsBlockedResearchUrlV2_(raw)) return;
    const parsed = stOriginAndHostV2_(raw);
    if (!parsed || seenHosts[parsed.host]) return;
    seenHosts[parsed.host] = true;
    if (!stHostMatchesCreatorV2_(parsed.host, title)) return;
    out.push(parsed.origin);
  });
  return out.slice(0, 1);
}

function stIsPlaceholderEmailV2_(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return true;
  const exact = {
    'user@domain.com':1,
    'name@domain.com':1,
    'example@domain.com':1,
    'email@domain.com':1,
    'your@email.com':1,
    'you@example.com':1,
    'test@test.com':1,
  };
  if (exact[value]) return true;
  if (/@example\.(com|org|net)$/i.test(value)) return true;
  return false;
}

function stResearchWebsiteForPublicEmailV2_(baseUrl) {
  const paths = ['', 'contact', 'contact-us', 'about', 'about-us'];
  let fetchCount = 0;
  let placeholdersRejected = 0;
  for (let i = 0; i < paths.length; i++) {
    const url = paths[i] ? baseUrl.replace(/\/$/, '') + '/' + paths[i] : baseUrl;
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalTabsPublicResearch/2.3)' },
      });
      fetchCount += 1;
      const code = response.getResponseCode();
      if (code < 200 || code >= 400) continue;
      const html = response.getContentText();
      const emails = publicEmailsFromText_(html);
      for (let j = 0; j < emails.length; j++) {
        if (stIsPlaceholderEmailV2_(emails[j])) {
          placeholdersRejected += 1;
          continue;
        }
        return { email: emails[j], sourceUrl: url, fetchCount: fetchCount, placeholdersRejected: placeholdersRejected };
      }
    } catch (e) {
      fetchCount += 1;
    }
  }
  return { email: null, sourceUrl: null, fetchCount: fetchCount, placeholdersRejected: placeholdersRejected };
}
