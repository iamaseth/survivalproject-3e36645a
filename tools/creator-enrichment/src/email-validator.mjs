const FREE_MAIL = /@(gmail\.com|outlook\.com|hotmail\.com|yahoo\.com|proton\.me|protonmail\.com|icloud\.com)$/i;
const BAD_TLDS = new Set(['png','jpg','jpeg','gif','webp','svg','css','js','ico','woff','woff2','ttf','otf','pdf','xml','json','map','avif']);
const BAD_DOMAINS = [
  'creativecommons.org','sourceaudio.com','temu.com','myshopline.com','sentry-new.myshopline.com'
];
const BAD_DOMAIN_PATTERNS = [
  /(^|\.)amazon\.[a-z.]+$/i,
  /(^|\.)m\.media-amazon\.com$/i,
];
const PLACEHOLDERS = /^(user|name|email|test|hello)@(domain|example)\./i;
const GENERIC_WORDS = new Set(['the','and','with','official','channel','tv','show','outdoors','outdoor','survival','prepper','prepping','preparedness','gear','edc','off','grid','homestead','homesteading','radio','reviews','review']);

function domainOf(email) { return String(email || '').split('@')[1]?.toLowerCase() || ''; }
function localOf(email) { return String(email || '').split('@')[0]?.toLowerCase() || ''; }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; } }
function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/)
    .filter(x => x.length >= 3 && !GENERIC_WORDS.has(x));
}
function compact(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g,''); }
function registrableish(host) { return String(host || '').toLowerCase().replace(/^www\./,'').split('.').slice(-2,-1)[0] || ''; }
function titleAffinity(title, value) {
  const hay = compact(value);
  const tt = tokens(title);
  if (!hay || !tt.length) return false;
  return tt.some(t => hay.includes(compact(t)) && t.length >= 4);
}
function badDomain(domain) {
  return BAD_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`)) || BAD_DOMAIN_PATTERNS.some(rx => rx.test(domain));
}
function malformedAssetEmail(email) {
  const domain = domainOf(email);
  const tld = domain.split('.').pop();
  return BAD_TLDS.has(tld) || /@\d+x\.(png|jpg|jpeg|gif|webp)$/i.test(email) || /%[0-9a-f]{2}/i.test(email);
}

export function isPlausibleEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return false;
  if (PLACEHOLDERS.test(e) || malformedAssetEmail(e)) return false;
  if (/^(noreply|no-reply|donotreply|mailer-daemon|postmaster)@/i.test(e)) return false;
  if (badDomain(domainOf(e))) return false;
  return true;
}

export function sourcePriority(url, title, seedSource='') {
  const h = hostOf(url);
  let score = 0;
  if (/youtube\.com$|youtu\.be$/i.test(h)) score += 7;
  if (/linktr\.ee$|beacons\.ai$|bio\.site$|lnk\.bio$/i.test(h)) score += 6;
  if (titleAffinity(title, h)) score += 8;
  if (/channel description/i.test(seedSource)) score += 4;
  if (/contact|about|business|collab|sponsor|partner|media|press|inquir/i.test(url)) score += 2;
  if (/amazon\.|amzn\.to|temu\.|tidd\.ly|awin|avantlink|affiliate|ref=|tag=/i.test(url) && !titleAffinity(title, h)) score -= 10;
  return score;
}

export function evaluateEmailCandidate(candidate, title) {
  const email = String(candidate?.email || '').toLowerCase();
  const source = String(candidate?.source || '');
  const seedSource = String(candidate?.seedSource || '');
  const origin = String(candidate?.origin || 'unknown');
  const eDomain = domainOf(email);
  const sHost = hostOf(source);
  const reasons = [];

  if (!isPlausibleEmail(email)) return { ...candidate, confidence:'low', score:-100, accepted:false, reasons:['invalid/blocked email pattern'] };

  let score = 0;
  const directYoutube = /youtube\.com$|youtu\.be$/i.test(sHost) || origin === 'youtube';
  if (directYoutube) { score += 8; reasons.push('listed directly in public YouTube data'); }
  if (FREE_MAIL.test(email)) { score += 2; reasons.push('personal/public mailbox provider'); }
  if (titleAffinity(title, email)) { score += 4; reasons.push('email identity matches channel name'); }
  if (titleAffinity(title, sHost)) { score += 5; reasons.push('source domain matches channel identity'); }
  if (sHost && (eDomain === sHost || sHost.endsWith(`.${eDomain}`))) { score += 2; reasons.push('email domain matches source website'); }
  if (/channel description/i.test(seedSource)) { score += 3; reasons.push('website linked from channel description'); }
  if (/linktr\.ee$|beacons\.ai$|bio\.site$|lnk\.bio$/i.test(sHost)) { score += 3; reasons.push('creator link hub source'); }
  if (/contact|about|business|collab|sponsor|partner|media|press|inquir/i.test(source)) { score += 2; reasons.push('contact/business page'); }

  const likelyVendor = !directYoutube && sHost && !titleAffinity(title, sHost) && !/linktr\.ee$|beacons\.ai$|bio\.site$|lnk\.bio$/i.test(sHost);
  if (likelyVendor && eDomain === sHost) { score -= 7; reasons.push('source appears to be a third-party/vendor site'); }
  if (/amazon\.|amzn\.to|temu\.|tidd\.ly|awin|avantlink|affiliate|superfiliate|ref=|tag=/i.test(source) && !titleAffinity(title, sHost)) { score -= 8; reasons.push('affiliate/marketplace source'); }

  let confidence = score >= 9 ? 'high' : score >= 6 ? 'medium' : 'low';
  return { ...candidate, email, confidence, score, accepted: confidence !== 'low', reasons };
}

export function chooseBestEmail(candidates, title) {
  const evaluated = (candidates || []).map(c => evaluateEmailCandidate(c, title));
  evaluated.sort((a,b) => b.score - a.score);
  const accepted = evaluated.find(x => x.accepted) || null;
  const bestAny = evaluated[0] || null;
  return { accepted, bestAny, evaluated };
}
