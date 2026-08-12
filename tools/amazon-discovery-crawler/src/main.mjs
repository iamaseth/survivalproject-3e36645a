import { PlaywrightCrawler } from 'crawlee';
import fs from 'node:fs/promises';

const seedUrl = process.argv[2] || 'https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019';
const outFile = process.argv[3] || 'amazon-discovery.json';
const found = new Map();

function classify(url) {
  const p = new URL(url).pathname.toLowerCase();
  if (p.includes('/live/video/')) return 'video';
  if (p.includes('/shop/')) return 'storefront';
  if (p.includes('/influencer/') || p.includes('/creator/') || p.includes('/profile/')) return 'profile';
  if (p.includes('/live/') || p.includes('/videos/')) return 'related_content';
  return null;
}

function clean(raw) {
  try {
    const u = new URL(raw, 'https://www.amazon.com');
    if (!['amazon.com', 'www.amazon.com'].includes(u.hostname.toLowerCase())) return null;
    u.hash = '';
    for (const key of ['tag', 'ref', 'ref_', 'linkCode', 'psc', 'dib', 'keywords', 'qid', 'sprefix']) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return null;
  }
}

const crawler = new PlaywrightCrawler({
  maxRequestsPerCrawl: 20,
  maxConcurrency: 1,
  requestHandlerTimeoutSecs: 60,
  launchContext: { launchOptions: { headless: true } },
  async requestHandler({ page, request, log }) {
    await page.waitForTimeout(2500);
    const links = await page.locator('a[href]').evaluateAll((els) => els.map((a) => ({ href: a.href, text: (a.textContent || '').trim() })));
    for (const link of links) {
      const url = clean(link.href);
      if (!url || url === clean(seedUrl)) continue;
      const type = classify(url);
      if (!type) continue;
      if (!found.has(url)) found.set(url, { candidate_url: url, candidate_type: type, label: link.text || null, source: request.loadedUrl || request.url });
    }
    log.info(`Collected ${found.size} Amazon candidate links`);
  },
});

await crawler.run([seedUrl]);
await fs.writeFile(outFile, JSON.stringify({ seed_url: seedUrl, discovered_at: new Date().toISOString(), candidates: [...found.values()] }, null, 2));
console.log(`Saved ${found.size} candidates to ${outFile}`);
