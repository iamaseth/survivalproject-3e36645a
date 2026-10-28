import { TIKTOK_PROFILE_RE } from "./tiktok-dm-verification";
import { hasGroundedDm } from "./final-approval";

export const CONTACT_STATUSES = ["Bulk Find", "AI Review", "Approved for Contact", "AI Rejected", "Sent", "Rejected", "Later"] as const;
export type ContactStatus = typeof CONTACT_STATUSES[number];
export type ContactRecord = {
  workflowStatus?: string | null; tiktok?: string | null; personalizedDm?: string | null;
  contactedDate?: string | null; outreachSentAt?: string | null; responseFollowup?: string | null;
  qualificationStatus?: string | null; sethApprovalStatus?: string | null;
  fullVerification?: string | null; verificationEvidence?: string | null; verificationDate?: string | null;
};

/** Display compatibility only: never writes or upgrades a legacy stage. */
export function contactStatus(c: ContactRecord): ContactStatus | null {
  if (c.contactedDate || c.outreachSentAt) return "Sent";
  const value = c.workflowStatus;
  if (CONTACT_STATUSES.includes(value as ContactStatus)) return value as ContactStatus;
  if (value === "research") return "Bulk Find";
  if (value === "ai_screened") return "AI Review";
  if (value === "second_look") return "Later";
  if (value === "sent") return "Sent";
  if (value === "rejected") return c.sethApprovalStatus === "rejected" ? "Rejected" : "AI Rejected";
  if (value === "approved" || value === "Manually Approved") return "Approved for Contact";
  return null;
}

export function contactReady(c: ContactRecord): boolean {
  if (contactStatus(c) !== "Approved for Contact" || c.contactedDate || c.outreachSentAt) return false;
  if (c.sethApprovalStatus === "rejected" || c.qualificationStatus === "Not Relevant" || /not relevant|dm blocked|do not contact|do not send/i.test(c.responseFollowup || "")) return false;
  if (!c.tiktok || !TIKTOK_PROFILE_RE.test(c.tiktok)) return false;
  // A stage-only legacy approval or MD Applied is not a verified contact decision.
  return Boolean(c.fullVerification?.startsWith("Verified for TikTok DM") && c.verificationDate &&
    (c.verificationEvidence?.trim().length ?? 0) >= 40 &&
    hasGroundedDm(c.verificationEvidence || "", c.personalizedDm || ""));
}

export function mdReviewStatus(attributes: unknown): "MD Applied" | "MD Needed" | "" {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return "";
  const value = (attributes as Record<string, unknown>)["MD Review Status"] ?? (attributes as Record<string, unknown>).md_review_status;
  return value === "MD Applied" || value === "MD Needed" ? value : "";
}