import fs from 'node:fs/promises';

// Cross-platform creator enrichment worker.
// READS creators/candidates, researches only public URLs, and produces a review file.
// It NEVER writes to Supabase and NEVER guesses emails or social handles.

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const outFile = process.env.ENRICHMENT_OUTPUT || 'creator-enrichment-review.json';
const limit = Math.max(1, Math.min(Number(process.env.ENRICHMENT_LIMIT || 100), 1000));
const timeoutMs = 12000;

if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const socialHosts = {
  instagram: ['instagram.com'], tiktok: ['tiktok.com'], facebook: ['facebook.com', 'fb.com'],
  youtube: ['youtube.com', 'youtu.be'], amazon: ['amazon.com'],
};
const linkHubHosts = ['linktr.ee', 'beacons.ai', 'bio.site', 'lnk.bio', 'solo.to', 'campsite.bio'];

function cleanUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}
function host(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function isAmazonStorefront(url) {
  try { const u = new URL(url); return /(^|\.)amazon\.com$/i.test(u.hostname) && /^\/shop\/[A-Za-z0-9@._-]+/i.test(u.pathname); } catch { return false; }
}
function classify(url) {
  const h = host(url);
  if (isAmazonStorefront(url)) return 'amazon_storefront';
  for (const [kind, hosts] of Object.entries(socialHosts)) if (hosts.some((x) => h === x || h.endsWith(`.${x}`))) return kind;
  if (linkHubHosts.some((x) => h === x || h.endsWith(`.${x}`))) return 'link_hub';
  return 'website';
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function emails(text) {
  return unique((String(text || '').match(emailRx) || []).map((e) => e.toLowerCase()))
    .filter((e) => !/example\.(com|org|net)$/.test(e));
}
function links(html, base) {
  const found = [];
  for (const m of String(html || '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try { const u = new URL(m[1], base); if (['http:', 'https:'].includes(u.protocol)) found.push(u.toString()); } catch {}
  }
  return unique(found);
}
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 SurvivalTabsCreatorResearch/1.0' } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('text/html')) return { ok: false, status: res.status, url: res.url || url, text: '' };
    return { ok: true, status: res.status, url: res.url || url, text: (await res.text()).slice(0, 1500000) };
  } catch (error) { return { ok: false, status: 0, url, text: '', error: String(error) }; }
  finally { clearTimeout(timer); }
}
async function supabase(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`Supabase read failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const creators = await supabase(`creators?select=id,name,email,facebook,instagram,tiktok,youtube,amazon,normalized_domain,primary_platforms,research_notes&order=created_at.asc&limit=${limit}`);
const candidates = await supabase(`youtube_candidates?select=id,channel_id,channel_title,channel_url,business_email,description_email,external_links,status&status=eq.pending&order=created_at.desc&limit=${limit}`);

async function research(entity, sourceType) {
  const known = [];
  for (const key of ['facebook', 'instagram', 'tiktok', 'youtube']) if (entity[key]) known.push(entity[key]);
  if (entity.amazon && /^https?:/i.test(entity.amazon)) known.push(entity.amazon);
  if (entity.normalized_domain) known.push(`https://${entity.normalized_domain}`);
  if (entity.channel_url) known.push(entity.channel_url);
  for (const item of Array.isArray(entity.external_links) ? entity.external_links : []) {
    for (const value of Object.values(item || {})) if (typeof value === 'string' && /^https?:/i.test(value)) known.push(value);
  }

  const queue = unique(known.map(cleanUrl)).slice(0, 12);
  const discovered = [];
  const foundEmails = [];
  const evidence = [];
  const visited = new Set();

  while (queue.length && visited.size < 16) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const page = await fetchText(url);
    evidence.push({ url, final_url: page.url, status: page.status, ok: page.ok });
    if (!page.ok) continue;
    foundEmails.push(...emails(page.text));
    const pageLinks = links(page.text, page.url);
    for (const link of pageLinks) {
      const kind = classify(link);
      if (kind !== 'website' || host(link) === host(page.url)) discovered.push({ kind, url: cleanUrl(link), source_url: page.url });
      if ((kind === 'link_hub' || (kind === 'website' && visited.size < 5)) && queue.length < 20) queue.push(cleanUrl(link));
    }
  }

  const verified = [];
  for (const item of discovered.filter((x) => x.url)) {
    if (item.kind === 'amazon_storefront') {
      const check = await fetchText(item.url);
      if (check.ok && isAmazonStorefront(check.url)) verified.push({ ...item, url: check.url, verified: true });
    } else verified.push({ ...item, verified: true });
  }

  const existingEmail = (entity.email || entity.business_email || entity.description_email || '').toLowerCase() || null;
  return {
    source_type: sourceType,
    source_id: entity.id,
    name: entity.name || entity.channel_title || null,
    existing_email: existingEmail,
    suggested_emails: unique(foundEmails).filter((e) => e !== existingEmail),
    suggested_links: [...new Map(verified.map((x) => [`${x.kind}:${x.url}`, x])).values()],
    evidence,
    review_required: true,
  };
}

const results = [];
for (const creator of creators) results.push(await research(creator, 'creator'));
for (const candidate of candidates) results.push(await research(candidate, 'youtube_candidate'));

await fs.writeFile(outFile, JSON.stringify({ generated_at: new Date().toISOString(), policy: 'review-only; no database writes; public evidence only; never guess', creators_read: creators.length, candidates_read: candidates.length, results }, null, 2));
console.log(`Enrichment review created: ${results.length} records -> ${outFile}`);
console.log('No Supabase rows were modified. Review suggestions before applying them.');
