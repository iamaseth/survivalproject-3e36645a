import { TIKTOK_PROFILE_RE } from "./tiktok-dm-verification";
import { contactReady, type ContactRecord } from "./contact-workflow";
type Row = ContactRecord;
export const isBlockedFollowup = (f?: string | null) => /not relevant|dm blocked|do not contact|do not send/i.test(f || "");
/** Contact queue requires verified fit and a grounded DM, not a stage-only approval. */
export function inRenaPool(c: Row): boolean {
  return contactReady(c);
}
export function canOpenTikTok(c: Row): boolean {
  return Boolean(c.tiktok && TIKTOK_PROFILE_RE.test(c.tiktok));
}
export function canCopyDm(c: Row): boolean {
  return Boolean(c.personalizedDm?.trim()) && !isBlockedFollowup(c.responseFollowup);
}
