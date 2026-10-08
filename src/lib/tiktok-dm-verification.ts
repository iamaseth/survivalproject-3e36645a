import type { CreatorRow } from "@/lib/creator-partnerships";

// Only an explicit human review written by the TikTok DM review page counts.
// Qualification, DM text, personalization status or research notes never count.
export const VERIFIED_PREFIX = "Verified for TikTok DM";
export const REJECTED_PREFIX = "Rejected for TikTok DM";
export const ASSUMED_METHOD = "TikTok DM (assumed — Rena queue)";
export const MIN_EVIDENCE = 40;

export const TIKTOK_PROFILE_RE = /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/?$/i;

export function baseCandidate(c: CreatorRow) {
  return (
    Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) &&
    Boolean(c.personalizedDm?.trim()) &&
    c.qualificationStatus === "Qualified" &&
    !c.contactedDate &&
    !/not relevant|dm blocked|do not contact/i.test(c.responseFollowup || "")
  );
}

export function isDmVerified(c: CreatorRow) {
  return (
    (c.fullVerification || "").startsWith(VERIFIED_PREFIX) &&
    (c.verificationEvidence || "").trim().length >= MIN_EVIDENCE &&
    Boolean(c.verificationDate)
  );
}

export const isDmRejected = (c: CreatorRow) => (c.fullVerification || "").startsWith(REJECTED_PREFIX);
