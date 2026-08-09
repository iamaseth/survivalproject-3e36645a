// Creator Partnerships — aligned to "Survival Tabs — Influencer Operating System"
// Real spreadsheet schema (Master Database, 44 columns) + derived workflow fields.
import { SEED_CREATORS } from "./creators-seed";

export type CreatorPriority = "🔴 High" | "🟡 Medium" | "🟢 Low" | "⚪ Hold";
export type OutreachOwner = "RENA" | "VINA" | null;
export const SUPERVISOR = "RENA" as const;

export type SampleStatus =
  | "Not Sent"
  | "Approval Pending"
  | "Awaiting Address"
  | "Address Received"
  | "Shipped"
  | "Delivered"
  | "Refused";

export type PerryApproval = "Not Reviewed" | "Approved" | "Changes Requested" | "Declined";

export type AmazonStatus = "Yes" | "No" | "Unknown";

export type ResponseState =
  | "No Response"
  | "Waiting Reply"
  | "Replied — Interested"
  | "Replied — Declined"
  | "Bounced";

export interface OutreachEvent {
  id: string;
  at: string; // ISO date
  actor: "RENA" | "VINA" | "SETH" | "PERRY";
  channel: "Email" | "DM" | "Call" | "Note";
  subject?: string;
  body: string;
}

export interface CreatorRow {
  // Raw sheet fields (44)
  id: string;
  name: string;
  segment: string | null;
  primaryPlatforms: string | null;
  primarySource: string | null;
  reachSignal: string | null;
  email: string | null;
  contactRoute: string | null;
  contactConfidence: string | null;
  researchStatus: string | null;
  priority: CreatorPriority | null;
  amazon: string | null;
  researchNotes: string | null;
  lastResearched: string | null;
  sethNextAction: string | null;
  outreachOwner: OutreachOwner;
  perryComments: string | null;
  amazonConfidence: string | null;
  monetization: string | null;
  verificationEvidence: string | null;
  contactedDate: string | null;
  contactMethod: string | null;
  responseFollowup: string | null;
  sampleStatus: string | null;
  renaNotes: string | null;
  tuanAffiliateStatus: string | null;
  creatorCode: string | null;
  technicalNotes: string | null;
  recentActivityCheck: string | null;
  fullVerification: string | null;
  verificationDate: string | null;
  followersSignal: string | null;
  targetAudience: string | null;
  geography: string | null;
  geographyConfidence: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  otherPlatform: string | null;
  recommendedOffer: string | null;
  partnershipTier: string | null;
  offerConfidence: string | null;
  offerReasoning: string | null;

  // Derived / workflow additions
  supervisor: "RENA";
  perryApproval: PerryApproval;
  responseState: ResponseState;
  normalizedSampleStatus: SampleStatus;
  nextFollowUpDate: string | null;
  outreachHistory: OutreachEvent[];
}

// ------------ Normalization helpers ------------
function normSample(v: string | null): SampleStatus {
  if (!v) return "Not Sent";
  const s = v.toLowerCase();
  if (s.includes("delivered")) return "Delivered";
  if (s.includes("shipped") || s.includes("in transit")) return "Shipped";
  if (s.includes("address received") || s.includes("addr received")) return "Address Received";
  if (s.includes("await") && s.includes("address")) return "Awaiting Address";
  if (s.includes("approval")) return "Approval Pending";
  if (s.includes("refus") || s.includes("declin")) return "Refused";
  return "Not Sent";
}

function normResponse(v: string | null): ResponseState {
  if (!v) return "No Response";
  const s = v.toLowerCase();
  if (s.includes("bounce")) return "Bounced";
  if (s.includes("declin") || s.includes("not interested") || s.includes("pass")) return "Replied — Declined";
  if (s.includes("interest") || s.includes("reply") || s.includes("replied") || s.includes("yes")) return "Replied — Interested";
  if (s.includes("wait") || s.includes("await") || s.includes("pending") || s.includes("follow")) return "Waiting Reply";
  return "Waiting Reply";
}

function normPerry(v: string | null): PerryApproval {
  if (!v) return "Not Reviewed";
  const s = v.toLowerCase();
  if (s.includes("approve")) return "Approved";
  if (s.includes("chang") || s.includes("revise")) return "Changes Requested";
  if (s.includes("declin") || s.includes("no ")) return "Declined";
  return "Not Reviewed";
}

function addDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildHistory(r: {
  id: string;
  contactedDate: string | null;
  contactMethod: string | null;
  outreachOwner: OutreachOwner;
  responseFollowup: string | null;
  sampleStatus: string | null;
  renaNotes: string | null;
}): OutreachEvent[] {
  const events: OutreachEvent[] = [];
  const actor = (r.outreachOwner ?? "RENA") as "RENA" | "VINA";
  if (r.contactedDate) {
    events.push({
      id: `${r.id}-o1`,
      at: r.contactedDate,
      actor,
      channel: (r.contactMethod?.toLowerCase().includes("dm") ? "DM" : "Email") as "Email" | "DM",
      subject: "Initial outreach — Survival Tabs sample offer",
      body: r.renaNotes ?? "Sent initial outreach using approved template.",
    });
  }
  if (r.responseFollowup) {
    events.push({
      id: `${r.id}-o2`,
      at: addDays(r.contactedDate, 2) ?? r.contactedDate ?? new Date().toISOString().slice(0, 10),
      actor,
      channel: "Note",
      body: `Response / follow-up: ${r.responseFollowup}`,
    });
  }
  if (r.sampleStatus) {
    events.push({
      id: `${r.id}-o3`,
      at: addDays(r.contactedDate, 4) ?? new Date().toISOString().slice(0, 10),
      actor,
      channel: "Note",
      body: `Sample status: ${r.sampleStatus}`,
    });
  }
  return events;
}

// ------------ Legacy seed (reference only) ------------
// The hard-coded ST-INF-001–250 roster is kept for historical reference ONLY.
// It is never pushed into the database and never rendered in the live CRM.
// The live roster is hydrated exclusively from the `creators` table.
export const LEGACY_SEED_CREATORS: CreatorRow[] = (SEED_CREATORS as any[]).map((r) => {
  const owner = (r.outreachOwner ?? null) as OutreachOwner;
  const priority = (r.priority ?? null) as CreatorPriority | null;
  const nextFollowUpDate =
    r.contactedDate && !normResponse(r.responseFollowup).startsWith("Replied")
      ? addDays(r.contactedDate, 5)
      : null;
  return {
    ...r,
    priority,
    outreachOwner: owner,
    supervisor: "RENA" as const,
    perryApproval: normPerry(r.perryComments),
    responseState: normResponse(r.responseFollowup),
    normalizedSampleStatus: normSample(r.sampleStatus),
    nextFollowUpDate,
    outreachHistory: buildHistory(r),
  } as CreatorRow;
});

// Database is the single source of truth — starts empty, filled by hydrateCreatorsFromDB().
export const CREATORS: CreatorRow[] = [];


export const creatorById = (id: string) => CREATORS.find((c) => c.id === id);

// ------------ Queues / derived selectors ------------
export const today = () => new Date().toISOString().slice(0, 10);

export const isOverdue = (c: CreatorRow) =>
  !!c.nextFollowUpDate && c.nextFollowUpDate < today() && c.responseState !== "Replied — Interested" && c.responseState !== "Replied — Declined";

export const isWaitingReply = (c: CreatorRow) =>
  !!c.contactedDate && (c.responseState === "Waiting Reply" || c.responseState === "No Response");

export const isReadyForOutreach = (c: CreatorRow) =>
  !c.contactedDate && c.priority === "🔴 High" && c.perryApproval !== "Declined";

export const needsPerryApproval = (c: CreatorRow) =>
  c.perryApproval === "Not Reviewed" && (c.priority === "🔴 High" || c.priority === "🟡 Medium");

// ------------ Templates (from Templates sheet) ------------
export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "initial",
    name: "Initial outreach",
    subject: "Survival Tabs — quick intro + complimentary sample",
    body:
      "Hi {{name}},\n\nI'm reaching out from Survival Tabs. We make a compact 15-day emergency nutrition tab, and after reviewing your recent {{platform}} work on {{segment}} I thought there might be a natural fit.\n\nWe'd be glad to send a complimentary sample — no posting obligation. If you'd like to try it, just reply with a shipping name, address and phone number for the carrier.\n\nThanks for considering it,\n{{owner}} · Survival Tabs",
  },
  {
    id: "followup",
    name: "Follow-up",
    subject: "Following up — Survival Tabs sample",
    body:
      "Hi {{name}}, just following up on my note about Survival Tabs. No pressure at all — we would simply be glad to provide more information or arrange a complimentary sample if it is relevant to your content.\n\n— {{owner}}",
  },
  {
    id: "shipping",
    name: "Shipping details request",
    subject: "Survival Tabs — sample approved, need shipping details",
    body:
      "Thank you. Perry has approved the sample. Please send the preferred recipient name, shipping address and phone number needed by the carrier. We will confirm once shipment is arranged.\n\n— {{owner}}",
  },
  {
    id: "affiliate",
    name: "Affiliate interest",
    subject: "Survival Tabs — affiliate arrangement",
    body:
      "Thanks for your interest in working together. We can discuss an affiliate arrangement after the initial product review and internal approval. We will confirm the final terms and tracking link before anything goes live.\n\n— {{owner}}",
  },
];

export function renderTemplate(t: OutreachTemplate, c: CreatorRow, owner: string) {
  const vars: Record<string, string> = {
    name: c.name.split(/[-—|]/)[0].trim(),
    platform: c.primaryPlatforms ?? "your channel",
    segment: c.segment ?? "preparedness",
    owner,
  };
  const sub = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
  return { subject: sub(t.subject), body: sub(t.body) };
}

// ------------ CSV import (client-side, matches sheet headers) ------------
export const SHEET_HEADERS = [
  "Creator ID","Creator","Segment","Primary Platforms","Primary Source","Reach / Location Signal",
  "Verified Public Email","Official Contact Route","Contact Confidence","Research Status","Priority",
  "Amazon","Research Notes / Next Check","Last Researched","Seth Next Action","Outreach Owner",
  "Perry Comments","Amazon Confidence","Monetization","Verification Evidence","Contacted Date",
  "Contact Method","Response / Follow-up","Sample Status","Rena Notes","Tuan Affiliate Status",
  "Creator Code / Link","Technical Notes","Recent Activity Check","Full Verification Result",
  "Verification Evidence / Date","Current Followers / Reach Signal","Main Target Audience",
  "Likely Audience Geography","Geography Confidence","Facebook URL","Instagram URL","TikTok URL",
  "YouTube URL","Other Platform + URL","Recommended Offer","Estimated Partnership Tier",
  "Offer Confidence","Offer Reasoning",
];

export function priorityTone(p: CreatorPriority | null): string {
  if (!p) return "bg-muted text-muted-foreground";
  if (p.includes("High")) return "bg-red-100 text-red-800 border border-red-200";
  if (p.includes("Medium")) return "bg-amber-100 text-amber-800 border border-amber-200";
  if (p.includes("Low")) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  return "bg-muted text-muted-foreground";
}

export function ownerTone(o: OutreachOwner): string {
  if (o === "RENA") return "bg-[color:var(--forest)]/15 text-[color:var(--forest)]";
  if (o === "VINA") return "bg-[color:var(--gold)]/20 text-[color:var(--forest)]";
  return "bg-muted text-muted-foreground";
}

export function perryTone(p: PerryApproval): string {
  if (p === "Approved") return "bg-emerald-100 text-emerald-800";
  if (p === "Changes Requested") return "bg-amber-100 text-amber-800";
  if (p === "Declined") return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}

export function sampleTone(s: SampleStatus): string {
  if (s === "Delivered") return "bg-emerald-100 text-emerald-800";
  if (s === "Shipped") return "bg-blue-100 text-blue-800";
  if (s === "Address Received" || s === "Awaiting Address") return "bg-amber-100 text-amber-800";
  if (s === "Approval Pending") return "bg-muted text-muted-foreground";
  if (s === "Refused") return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}

export function responseTone(r: ResponseState): string {
  if (r === "Replied — Interested") return "bg-emerald-100 text-emerald-800";
  if (r === "Replied — Declined") return "bg-red-100 text-red-800";
  if (r === "Waiting Reply") return "bg-amber-100 text-amber-800";
  if (r === "Bounced") return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}

export function amazonStatus(v: string | null): AmazonStatus {
  if (!v) return "Unknown";
  const s = v.toLowerCase();
  if (s.includes("yes")) return "Yes";
  if (s.includes("no")) return "No";
  return "Unknown";
}

export function amazonTone(status: AmazonStatus): string {
  if (status === "Yes") return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (status === "No") return "bg-red-100 text-red-800 border border-red-200";
  return "bg-muted text-muted-foreground";
}

// ------------ DB-hydrated roster ------------
// The exported CREATORS array starts from the static SEED. On app boot,
// `hydrateCreatorsFromDB()` pulls the team-shared `public.creators` table
// and appends any rows the local seed doesn't already have (imported and
// AI-researched creators) so every teammate sees the same roster.
import { useSyncExternalStore } from "react";

const rosterListeners = new Set<() => void>();
let rosterVersion = 0;
function bumpRoster() { rosterVersion++; rosterListeners.forEach((l) => l()); }

export function useCreatorsVersion(): number {
  return useSyncExternalStore(
    (fn) => { rosterListeners.add(fn); return () => rosterListeners.delete(fn); },
    () => rosterVersion,
    () => 0,
  );
}

function rowToCreator(r: Record<string, unknown>): CreatorRow {
  const owner = ((r.outreach_owner ?? null) as OutreachOwner);
  const priority = ((r.priority ?? null) as CreatorPriority | null);
  const contactedDate = (r.contacted_date as string | null) ?? null;
  const responseFollowup = (r.response_followup as string | null) ?? null;
  const responseState = normResponse(responseFollowup);
  const nextFollowUpDate = contactedDate && !responseState.startsWith("Replied")
    ? addDays(contactedDate, 5) : null;
  const base = {
    id: r.id as string,
    name: (r.name as string) ?? "Unnamed",
    segment: (r.segment as string | null) ?? null,
    primaryPlatforms: (r.primary_platforms as string | null) ?? null,
    primarySource: (r.primary_source as string | null) ?? null,
    reachSignal: (r.reach_signal as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    contactRoute: (r.contact_route as string | null) ?? null,
    contactConfidence: (r.contact_confidence as string | null) ?? null,
    researchStatus: (r.research_status as string | null) ?? null,
    priority,
    amazon: (r.amazon as string | null) ?? null,
    researchNotes: (r.research_notes as string | null) ?? null,
    lastResearched: (r.last_researched as string | null) ?? null,
    sethNextAction: (r.seth_next_action as string | null) ?? null,
    outreachOwner: owner,
    perryComments: (r.perry_comments as string | null) ?? null,
    amazonConfidence: (r.amazon_confidence as string | null) ?? null,
    monetization: (r.monetization as string | null) ?? null,
    verificationEvidence: (r.verification_evidence as string | null) ?? null,
    contactedDate,
    contactMethod: (r.contact_method as string | null) ?? null,
    responseFollowup,
    sampleStatus: (r.sample_status as string | null) ?? null,
    renaNotes: (r.rena_notes as string | null) ?? null,
    tuanAffiliateStatus: (r.tuan_affiliate_status as string | null) ?? null,
    creatorCode: (r.creator_code as string | null) ?? null,
    technicalNotes: (r.technical_notes as string | null) ?? null,
    recentActivityCheck: (r.recent_activity_check as string | null) ?? null,
    fullVerification: (r.full_verification as string | null) ?? null,
    verificationDate: (r.verification_date as string | null) ?? null,
    followersSignal: (r.followers_signal as string | null) ?? null,
    targetAudience: (r.target_audience as string | null) ?? null,
    geography: (r.geography as string | null) ?? null,
    geographyConfidence: (r.geography_confidence as string | null) ?? null,
    facebook: (r.facebook as string | null) ?? null,
    instagram: (r.instagram as string | null) ?? null,
    tiktok: (r.tiktok as string | null) ?? null,
    youtube: (r.youtube as string | null) ?? null,
    otherPlatform: (r.other_platform as string | null) ?? null,
    recommendedOffer: (r.recommended_offer as string | null) ?? null,
    partnershipTier: (r.partnership_tier as string | null) ?? null,
    offerConfidence: (r.offer_confidence as string | null) ?? null,
    offerReasoning: (r.offer_reasoning as string | null) ?? null,
    supervisor: "RENA" as const,
    perryApproval: normPerry((r.perry_comments as string | null) ?? null),
    responseState,
    normalizedSampleStatus: normSample((r.sample_status as string | null) ?? null),
    nextFollowUpDate,
    outreachHistory: buildHistory({
      id: r.id as string,
      contactedDate,
      contactMethod: (r.contact_method as string | null) ?? null,
      outreachOwner: owner,
      responseFollowup,
      sampleStatus: (r.sample_status as string | null) ?? null,
      renaNotes: (r.rena_notes as string | null) ?? null,
    }),
  };
  return base;
}

let creatorsHydrated = false;
export async function hydrateCreatorsFromDB(): Promise<void> {
  if (creatorsHydrated || typeof window === "undefined") return;
  creatorsHydrated = true;
  try {
    const [{ listCreators, seedCreatorsFromStatic }] = await Promise.all([
      import("./creators.functions"),
    ]);
    // Bootstrap DB with static seed the first time any teammate signs in.
    const seedPayload = CREATORS.map((c) => ({
      id: c.id, name: c.name, code: c.creatorCode, segment: c.segment,
      primary_platforms: c.primaryPlatforms, email: c.email, amazon: c.amazon,
      priority: c.priority, outreach_owner: c.outreachOwner,
      research_notes: c.researchNotes, last_researched: c.lastResearched,
      contacted_date: c.contactedDate, contact_method: c.contactMethod,
      response_followup: c.responseFollowup, sample_status: c.sampleStatus,
      rena_notes: c.renaNotes, perry_comments: c.perryComments,
      recommended_offer: c.recommendedOffer,
    }));
    try { await seedCreatorsFromStatic({ data: { rows: seedPayload as never } }); }
    catch (e) { console.error("[creators] seed failed", e); }

    const { rows } = await listCreators();
    const existingIds = new Set(CREATORS.map((c) => c.id));
    let added = 0;
    for (const r of rows) {
      const id = (r as Record<string, unknown>).id as string;
      if (existingIds.has(id)) continue;
      CREATORS.push(rowToCreator(r as Record<string, unknown>));
      existingIds.add(id);
      added++;
    }
    if (added > 0) bumpRoster();
  } catch (e) {
    console.error("[creators] hydrateCreatorsFromDB failed", e);
  }
}

