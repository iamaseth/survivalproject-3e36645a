// Pure client-safe helpers for approved email templates.
// Kept out of *.functions.ts so both the Templates page preview and the
// GmailPanel picker can share one implementation with no server round-trip.
import type { CreatorRow } from "./creator-partnerships";

export interface EmailTemplate {
  id: string;
  name: string;
  segment: string | null;
  subject: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TemplateStatus = "draft" | "approved" | "needs_reapproval";

export function templateStatus(t: EmailTemplate): TemplateStatus {
  if (t.active && t.approvedBy) return "approved";
  if (t.approvedBy || t.approvedAt) return "needs_reapproval";
  return "draft";
}

export interface MergeContext {
  creator_name: string;
  platform: string;
  handle: string;
  segment: string;
  sender_first_name: string;
}

export function mergeContextForCreator(c: CreatorRow, senderFullName: string | null | undefined): MergeContext {
  const handle =
    c.instagram || c.tiktok || c.youtube || c.facebook || "";
  const platform =
    c.instagram ? "Instagram" :
    c.tiktok    ? "TikTok"    :
    c.youtube   ? "YouTube"   :
    c.facebook  ? "Facebook"  : "";
  const firstName = (senderFullName ?? "").trim().split(/\s+/)[0] || "The team";
  return {
    creator_name: c.name || "there",
    platform,
    handle,
    segment: c.segment || "your niche",
    sender_first_name: firstName,
  };
}

const MERGE_KEYS: (keyof MergeContext)[] = [
  "creator_name", "platform", "handle", "segment", "sender_first_name",
];

export function applyMergeFields(text: string, ctx: MergeContext): string {
  let out = text ?? "";
  for (const key of MERGE_KEYS) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    out = out.replace(re, ctx[key] ?? "");
  }
  return out;
}

// Sample used by the Templates page preview so authors can see how merge
// fields resolve before saving.
export const SAMPLE_MERGE_CONTEXT: MergeContext = {
  creator_name: "Alex Rivera",
  platform:     "Instagram",
  handle:       "@alexrivera",
  segment:      "Outdoor / Backpacking",
  sender_first_name: "Rena",
};

export const MERGE_FIELD_HINTS: { key: keyof MergeContext; label: string }[] = [
  { key: "creator_name",       label: "Creator's display name" },
  { key: "platform",           label: "Primary platform (Instagram / TikTok / YouTube / Facebook)" },
  { key: "handle",             label: "Creator handle on their primary platform" },
  { key: "segment",            label: "Creator segment / niche" },
  { key: "sender_first_name",  label: "Your first name (the signed-in team member)" },
];

// Segment-first ordering, then general, then everything else.
export function orderTemplatesForCreator(
  all: EmailTemplate[],
  creatorSegment: string | null,
): EmailTemplate[] {
  const seg = (creatorSegment ?? "").trim().toLowerCase();
  const score = (t: EmailTemplate) => {
    const s = (t.segment ?? "").trim().toLowerCase();
    if (seg && s === seg) return 0;
    if (!s || s === "general") return 1;
    return 2;
  };
  return [...all].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}
