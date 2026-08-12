import { PlaywrightCrawler } from 'crawlee';
import fs from 'node:fs/promises';

const DEFAULT_SEED = 'https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019';
const DEFAULT_KEYWORDS = [
  'emergency food', 'survival food', 'preparedness', 'prepper', 'bug out bag',
  'camping food', 'food storage', 'emergency kit', 'survival gear',
];

const seedUrl = process.env.AMAZON_SEED_URL || DEFAULT_SEED;
const keywords = (process.env.AMAZON_KEYWORDS || DEFAULT_KEYWORDS.join('|'))
  .split('|').map((v) => v.trim()).filter(Boolean).slice(0, 12);
const outFile = process.env.AMAZON_OUTPUT || 'amazon-discovery.json';
const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const found = new Map();

const BAD_PATHS = new Set([
  '/live', '/live/', '/live/info', '/live/info/', '/live/channel', '/live/channel/',
  '/live/discover', '/live/discover/', '/live/search', '/live/search/', '/videos', '/videos/',
]);

function classify(url) {
  const p = new URL(url).pathname.toLowerCase();
  if (BAD_PATHS.has(p)) return null;
  if (/\/live\/video\/[a-z0-9_-]{8,}/i.test(p)) return 'video';
  if (/\/shop\/[a-z0-9._-]{2,}/i.test(p)) return 'storefront';
  if (/\/(?:influencer|creator|profile)\/[a-z0-9._-]{2,}/i.test(p)) return 'profile';
  return null;
}

function clean(raw) {
  try {
    const u = new URL(raw, 'https://www.amazon.com');
    if (!['amazon.com', 'www.amazon.com'].includes(u.hostname.toLowerCase())) return null;
    u.hash = '';
    for (const key of ['tag', 'ref', 'ref_', 'linkCode', 'psc', 'dib', 'keywords', 'qid', 'sprefix']) u.searchParams.delete(key);
    return u.toString();
  } catch { return null; }
}

function creatorName(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 2 || s.length > 100) return null;
  const bad = /^(info|channel|amazon live|live|watch|shop|see more|learn more|explore|related content)$/i;
  return bad.test(s) ? null : s;
}

function searchUrls() {
  const urls = [{ url: seedUrl, source: 'Survival Tabs review — related content' }];
  for (const keyword of keywords) {
    const q = encodeURIComponent(keyword);
    urls.push({ url: `https://www.amazon.com/live/search?k=${q}`, source: `Search: ${keyword}` });
    urls.push({ url: `https://www.amazon.com/s?k=${q}`, source: `Search: ${keyword}` });
  }
  return urls;
}

const sources = new Map(searchUrls().map((x) => [clean(x.url), x.source]));

const crawler = new PlaywrightCrawler({
  maxRequestsPerCrawl: Math.min(30, searchUrls().length),
  maxConcurrency: 1,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: 75,
  launchContext: {
    launchOptions: {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },
  async requestHandler({ page, request, log }) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2200);

    const links = await page.locator('a[href]').evaluateAll((els) => els.map((a) => ({
      href: a.href,
      text: (a.textContent || '').trim(),
      aria: a.getAttribute('aria-label') || '',
      title: a.getAttribute('title') || '',
    })));

    for (const link of links) {
      const url = clean(link.href);
      if (!url || url === clean(seedUrl)) continue;
      const type = classify(url);
      if (!type) continue;

      const name = creatorName(link.aria) || creatorName(link.title) || creatorName(link.text);
      const source = sources.get(clean(request.loadedUrl || request.url)) || 'Amazon browser discovery';
      const existing = found.get(url);
      if (!existing || (!existing.creator_name && name)) {
        found.set(url, {
          seed_url: seedUrl,
          candidate_url: url,
          candidate_type: type,
          creator_name: name,
          source_label: source,
          status: 'new',
        });
      }
    }
    log.info(`Collected ${found.size} strict creator/video links`);
  },
});

await crawler.run(searchUrls().map((x) => x.url));
const candidates = [...found.values()];
await fs.writeFile(outFile, JSON.stringify({ seed_url: seedUrl, keywords, discovered_at: new Date().toISOString(), candidates }, null, 2));

if (supabaseUrl && serviceKey && candidates.length) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/amazon_discovery_candidates?on_conflict=seed_url,candidate_url`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(candidates),
  });
  if (!response.ok) {
    throw new Error(`Supabase import failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  console.log(`Imported up to ${candidates.length} candidates into Supabase.`);
} else if (!supabaseUrl || !serviceKey) {
  console.log('Supabase secrets not configured; JSON output created only.');
}

console.log(`Crawlee finished: ${candidates.length} strict Amazon creator candidates saved to ${outFile}`);
