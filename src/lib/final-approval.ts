import type { CreatorRow } from "@/lib/creator-partnerships";
import { isDmVerified, TIKTOK_PROFILE_RE } from "@/lib/tiktok-dm-verification";

export const GENERIC_FINAL_DM = /natural fit for the preparedness content you already share|I came across your content|your preparedness content/i;

export function hasGroundedDm(evidence: string, dm: string) {
  if (!dm.trim() || dm.length > 2000 || GENERIC_FINAL_DM.test(dm) || /^\s*(NOT RELEVANT|NEEDS MANUAL REVIEW)/i.test(dm)) return false;
  // Conservative evidence linkage, never a substitute for the researcher's direct review.
  const words = new Set((evidence.toLowerCase().match(/[a-z]{5,}/g) || []));
  const messageWords = new Set(dm.toLowerCase().match(/[a-z]{5,}/g) || []);
  return [...words].filter((word) => messageWords.has(word)).length >= 2;
}

export function isPendingResearchCandidate(c: CreatorRow) {
  return Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) && c.qualificationStatus === "Qualified" &&
    !c.contactedDate && !c.outreachSentAt && !c.sethApprovalStatus &&
    !/not relevant|dm blocked|do not contact|do not send/i.test(c.responseFollowup || "");
}

export function isFinalApprovalReady(c: CreatorRow) {
  return isPendingResearchCandidate(c) && isDmVerified(c) && hasGroundedDm(c.verificationEvidence || "", c.personalizedDm || "");
}