import { describe, it, expect } from "vitest";
import { inRenaPool } from "../src/lib/rena-queue-eligibility";
const base = { workflowStatus: "approved", sethApprovalStatus: "approved", qualificationStatus: "Qualified", responseFollowup: null, tiktok: "https://www.tiktok.com/@abc", personalizedDm: "Hi, your camping supplies and emergency planning caught my attention.", fullVerification: "Verified for TikTok DM — researcher", verificationDate: "2026-10-28", verificationEvidence: "Direct profile review shows camping supplies and emergency planning posts." };
describe("inRenaPool", () => {
  it("includes approved", () => expect(inRenaPool(base)).toBe(true));
  it("excludes rejected", () => expect(inRenaPool({ ...base, sethApprovalStatus: "rejected" })).toBe(false));
  it("excludes Not Relevant even if approval stale", () => expect(inRenaPool({ ...base, qualificationStatus: "Not Relevant" })).toBe(false));
  it("excludes blocked followup", () => expect(inRenaPool({ ...base, responseFollowup: "Not Relevant — x" })).toBe(false));
});
