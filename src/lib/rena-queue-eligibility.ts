import { TIKTOK_PROFILE_RE } from "./tiktok-dm-verification";
type Row = { workflowStatus?: string | null; sethApprovalStatus?: string | null; tiktok?: string | null; personalizedDm?: string | null; responseFollowup?: string | null };
export const isBlockedFollowup = (f?: string | null) => /not relevant|dm blocked|do not contact|do not send/i.test(f || "");
/** Section 3 and Rena's queue share the same single authoritative status.
 * Only workflowStatus controls membership. Missing DM/profile and contact restrictions affect actions, not visibility. */
export function inRenaPool(c: Row): boolean {
  return c.workflowStatus === "approved";
}
export function canOpenTikTok(c: Row): boolean {
  return Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok));
}
export function canCopyDm(c: Row): boolean {
  return Boolean(c.personalizedDm?.trim()) && !isBlockedFollowup(c.responseFollowup);
}
