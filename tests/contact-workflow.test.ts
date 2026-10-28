import { describe, it, expect } from "vitest";
import { contactReady, contactStatus, mdReviewStatus, CONTACT_STATUSES } from "../src/lib/contact-workflow";
const ready = {workflowStatus:"approved",tiktok:"https://www.tiktok.com/@real.creator",personalizedDm:"Your camping supplies and emergency planning posts caught my attention.",fullVerification:"Verified for TikTok DM — researcher",verificationDate:"2026-10-28",verificationEvidence:"Direct public profile review: camping supplies and emergency planning posts."};
describe("contact workflow compatibility",()=>{
  it("keeps the seven requested labels",()=>expect(CONTACT_STATUSES).toEqual(["Bulk Find","AI Review","Approved for Contact","AI Rejected","Sent","Rejected","Later"]));
  it("keeps actionable verified legacy approval",()=>expect(contactReady(ready)).toBe(true));
  it("does not authorize stage-only approval",()=>expect(contactReady({...ready,fullVerification:null})).toBe(false));
  it("MD Applied alone never authorizes",()=>{expect(mdReviewStatus({md_review_status:"MD Applied"})).toBe("MD Applied");expect(contactReady({workflowStatus:"approved",personalizedDm:ready.personalizedDm,tiktok:ready.tiktok})).toBe(false);});
  it("preserves MD Needed separately",()=>expect(mdReviewStatus({"MD Review Status":"MD Needed"})).toBe("MD Needed"));
  it("keeps unknown MD review blank",()=>expect(mdReviewStatus({})).toBe(""));
  it("never includes Sent",()=>expect(contactReady({...ready,contactedDate:"2026-10-27"})).toBe(false));
  it("historical contact overrides a stale stage",()=>expect(contactStatus({...ready,outreachSentAt:"2026-10-27"})).toBe("Sent"));
  it("keeps Later out of contact",()=>expect(contactReady({...ready,workflowStatus:"second_look"})).toBe(false));
  it("never includes opted-out creators",()=>expect(contactReady({...ready,responseFollowup:"Do not contact"})).toBe(false));
  it("blocks review-needed drafts",()=>expect(contactReady({...ready,personalizedDm:"NEEDS MANUAL REVIEW camping supplies"})).toBe(false));
  it("retains manual rejection precedence",()=>expect(contactReady({...ready,sethApprovalStatus:"rejected"})).toBe(false));
});