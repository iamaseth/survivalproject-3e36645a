import type { CreatorRow } from "@/lib/creator-partnerships";

// Builds the manual ChatGPT prompt for one creator. Pure text; nothing is sent anywhere.
export function buildDmPrompt(c: CreatorRow, screening: string[]): string {
  const handle = (c.tiktok?.match(/@([^/?#]+)/)?.[1]) ?? c.name;
  return `You are helping Rena from The Survival Tabs write ONE TikTok DM to a single creator. Accuracy matters more than producing a message.

CREATOR
- TikTok handle: @${handle}
- Profile URL: ${c.tiktok}
- Name in our CRM: ${c.name}

SCREENING EVIDENCE (UNVERIFIED / INDIRECT — from public indexed web sources, NOT a direct check of the TikTok profile; may be wrong or about a different account):
${screening.length ? screening.map((s) => "- " + s).join("\n") : "- None saved."}
${c.verificationEvidence ? `- Researcher note: ${c.verificationEvidence}\n` : ""}
EXISTING DM (may be generic or contain unsupported claims — do not trust it):
${c.personalizedDm?.trim() || "(none)"}

PRODUCT FACTS (use only these; do not add others)
- The Survival Tabs makes compact emergency food/nutrition tablets designed for long-term storage, emergency kits, preparedness, camping and outdoor use.
- We are a small operation.
- Offer: a free sample pack for their honest opinion. Not a paid promotion. No contract, no obligation to post or mention us.

STRICT RULES
1. Verify against the actual TikTok profile, or the profile screenshot I attach. Use only what you can actually see there. Do not rely on the screening evidence alone.
2. If you cannot see the profile/screenshot, or it shows no trustworthy evidence of preparedness, survival, emergency, outdoor, homesteading, camping or similar relevant content, output exactly one line:
   NOT RELEVANT — <short reason>
   or
   NEEDS MANUAL REVIEW — <short reason>
   and nothing else. Never fabricate a DM.
3. If they are a genuine fit, write the DM:
   - Voice: Rena, friendly, warm, conversational, plain English, first person.
   - 60–110 words, 2–4 short paragraphs, no hashtags, no emojis unless natural, no links.
   - Open with ONE concrete, accurate reference to something visible on their profile (a video topic, playlist, bio line or series). No generic filler like "I came across your content" or "your preparedness content".
   - Do not invent facts about them (names, family, location, videos, follower counts) or about the product (no health, nutrition, shelf-life or calorie claims beyond the facts above).
   - Mention the free sample pack, honest opinion, no contract and no obligation to post.
   - End with a simple low-pressure question (e.g. "Would you be open to trying a pack?"). Do not ask for an address yet.
4. Output ONLY the final DM text (or the single NOT RELEVANT / NEEDS MANUAL REVIEW line). No preamble, no options, no notes.`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// Synchronous copy inside the click itself (before the new tab steals focus). Falls back to async clipboard.
export function copyTextNow(text: string): boolean {
  let ok = false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    ok = document.execCommand("copy");
    document.body.removeChild(ta);
  } catch { ok = false; }
  try { void navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* ignore */ }
  return ok;
}
