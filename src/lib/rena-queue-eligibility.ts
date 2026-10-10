import { TIKTOK_PROFILE_RE } from "./tiktok-dm-verification";
type Row = { sethApprovalStatus?: string | null; qualificationStatus?: string | null; workflowStatus?: string | null; outreachSentAt?: string | null; contactedDate?: string | null; outreachSecondLookAt?: string | null; responseFollowup?: string | null; tiktok?: string | null; personalizedDm?: string | null };
export const isBlockedFollowup = (f?: string | null) => /not relevant|dm blocked|do not contact|do not send/i.test(f || "");
/** Manual decisions win: any rejection or Not Relevant marker removes the creator, even if other fields are stale. */
export function inRenaPool(c: Row): boolean {
  return c.workflowStatus === "approved" && c.sethApprovalStatus === "approved" && !c.outreachSentAt && !c.contactedDate && !c.outreachSecondLookAt && !isBlockedFollowup(c.responseFollowup)
    && Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok)) && Boolean(c.personalizedDm?.trim());
}
