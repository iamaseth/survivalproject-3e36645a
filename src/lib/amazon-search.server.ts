const AMAZON_HOSTS = new Set(["amazon.com", "www.amazon.com"]);

export type CandidateType = "video" | "storefront" | "profile" | "related_content";
export type DiscoveryCandidate = { url: string; type: CandidateType };

export const DEFAULT_KEYWORDS = [
  "emergency food",
  "survival food",
  "preparedness",
  "prepper",
  "bug out bag",
  "camping food",
  "food storage",
  "emergency kit",
  "survival gear",
];

export const REFERENCE_SEED_URL =
  "https://www.amazon.com/live/video/03c6133b0f7a41fab0ead7f9c7b30019";

export function normalizeAmazonUrl(raw: string): string | null {
  try {
    const cleaned = raw
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/^"|"$/g, "");
    const url = cleaned.startsWith("http")
      ? new URL(cleaned)
      : new URL(cleaned, "https://www.amazon.com");
    if (!AMAZON_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (["tag", "ref", "ref_", "linkCode", "psc", "dib", "keywords", "qid", "sprefix"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function classify(url: string): CandidateType | null {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (p.includes("/live/video/")) return "video";
    if (p.includes("/shop/")) return "storefront";
    if (p.includes("/influencer/") || p.includes("/creator/") || p.includes("/profile/")) return "profile";
    if (p.includes("/live/") || p.includes("/videos/")) return "related_content";
    return null;
  } catch {
    return null;
  }
}

export function extractAmazonCandidates(html: string, seedUrl: string): DiscoveryCandidate[] {
  const seen = new Set<string>();
  const out: DiscoveryCandidate[] = [];
  const seed = normalizeAmazonUrl(seedUrl);
  const patterns = [
    /https?:\\?\/\\?\/(?:www\.)?amazon\.com[^"'<>\s]+/gi,
    /href=["']([^"']+)["']/gi,
    /"url"\s*:\s*"([^"]+)"/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const normalized = normalizeAmazonUrl(match[1] ?? match[0]);
      if (!normalized || normalized === seed || seen.has(normalized)) continue;
      const type = classify(normalized);
      if (!type) continue;
      seen.add(normalized);
      out.push({ url: normalized, type });
    }
  }
  return out.slice(0, 100);
}

export function searchUrlsForKeyword(keyword: string): string[] {
  const q = encodeURIComponent(keyword.trim());
  return [
    `https://www.amazon.com/live/search?k=${q}`,
    `https://www.amazon.com/s?k=${q}&i=shoplist`,
    `https://www.amazon.com/s?k=${q}`,
  ];
}

export async function fetchAmazonHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: false, status: response.status, html: "" };
    return { ok: true, status: response.status, html: await response.text() };
  } catch {
    return { ok: false, status: 0, html: "" };
  }
}
