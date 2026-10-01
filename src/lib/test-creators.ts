// Test Creator overlay — client-side store of synthetic creators used ONLY for
// safe Gmail workflow testing. Test creators live in localStorage, are tagged
// is_test=true, tied to the current Test Mode session, and expose a shape
// compatible with CreatorRow so the existing UI can render them without any
// changes to the imported (real) 250-row spreadsheet dataset.
import { useSyncExternalStore } from "react";
import type { CreatorRow } from "./creator-partnerships";

// Fixed test recipient — every outbound email while Test Mode is on is
// redirected here regardless of the creator's own email.
export const TEST_RECIPIENT_EMAIL = "thenxyz@gmail.com";

const LS_KEY = "st.test-creators.v1";

export interface TestCreatorEntry {
  id: string;
  name: string;
  email: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerRoleLabel: string | null;
  testSessionId: string | null;
  createdAt: string;
}

function read(): TestCreatorEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as TestCreatorEntry[]) : [];
  } catch { return []; }
}

let cache: TestCreatorEntry[] = read();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  }
  listeners.forEach((l) => l());
}
function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function snapshot() { return cache; }
function serverSnapshot(): TestCreatorEntry[] { return []; }

export function listTestCreators(): TestCreatorEntry[] { return cache; }

export function useTestCreators(): TestCreatorEntry[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function getTestCreator(id: string): TestCreatorEntry | undefined {
  return cache.find((c) => c.id === id);
}

export function createTestCreator(args: {
  email: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerRoleLabel: string | null;
  testSessionId: string | null;
}): TestCreatorEntry {
  const id = `TEST-GMAIL-${Date.now().toString(36).toUpperCase()}`;
  const entry: TestCreatorEntry = {
    id,
    name: "TEST – Gmail Workflow",
    email: args.email,
    ownerUserId: args.ownerUserId,
    ownerName: args.ownerName,
    ownerRoleLabel: args.ownerRoleLabel,
    testSessionId: args.testSessionId,
    createdAt: new Date().toISOString(),
  };
  cache = [entry, ...cache];
  emit();
  return entry;
}

/**
 * Fixed default test creator seeded automatically for the active Test Mode
 * session. Idempotent — safe to call any number of times; will not overwrite
 * a manually-edited existing TEST-0001 entry.
 */
export const FIXED_TEST_CREATOR_ID = "TEST-0001";

export function ensureFixedTestCreator(sessionId: string | null): TestCreatorEntry {
  const existing = cache.find((c) => c.id === FIXED_TEST_CREATOR_ID);
  if (existing) {
    // Keep session id in sync with the currently-active Test Mode session so
    // "Delete Test Creators Only" scoped to this session picks it up.
    if (sessionId && existing.testSessionId !== sessionId) {
      cache = cache.map((c) =>
        c.id === FIXED_TEST_CREATOR_ID ? { ...c, testSessionId: sessionId } : c,
      );
      emit();
      return cache.find((c) => c.id === FIXED_TEST_CREATOR_ID)!;
    }
    return existing;
  }
  const entry: TestCreatorEntry = {
    id: FIXED_TEST_CREATOR_ID,
    name: "TEST – Gmail Workflow",
    email: TEST_RECIPIENT_EMAIL,
    ownerUserId: null,
    ownerName: "Seth",
    ownerRoleLabel: "Owner",
    testSessionId: sessionId,
    createdAt: new Date().toISOString(),
  };
  cache = [entry, ...cache];
  emit();
  return entry;
}

export function deleteTestCreator(id: string): boolean {
  const next = cache.filter((c) => c.id !== id);
  if (next.length === cache.length) return false;
  cache = next; emit();
  return true;
}

// Adapt a TestCreatorEntry into a CreatorRow so it can flow through existing UI.
export function testCreatorToRow(t: TestCreatorEntry): CreatorRow {
  return {
    id: t.id,
    name: t.name,
    segment: "TEST — internal",
    primaryPlatforms: null,
    primarySource: null,
    reachSignal: null,
    email: t.email,
    contactRoute: null,
    contactConfidence: null,
    personalizedDm: null,
    personalizedEmailSubject: null,
    personalizedEmailBody: null,
    personalizationSource: null,
    personalizationStatus: null,
    qualificationStatus: null,
    researchStatus: null,
    priority: null,
    amazon: null,
    researchNotes: `Synthetic test creator created ${new Date(t.createdAt).toLocaleString()} for safe Gmail workflow testing.`,
    lastResearched: t.createdAt.slice(0, 10),
    sethNextAction: null,
    outreachOwner: null,
    perryComments: null,
    amazonConfidence: null,
    monetization: null,
    verificationEvidence: null,
    contactedDate: null,
    contactMethod: null,
    responseFollowup: null,
    sampleStatus: null,
    renaNotes: null,
    tuanAffiliateStatus: null,
    creatorCode: null,
    technicalNotes: null,
    recentActivityCheck: null,
    fullVerification: null,
    verificationDate: null,
    followersSignal: null,
    targetAudience: null,
    geography: null,
    geographyConfidence: null,
    facebook: null,
    instagram: null,
    tiktok: null,
    youtube: null,
    otherPlatform: null,
    recommendedOffer: null,
    partnershipTier: null,
    offerConfidence: null,
    offerReasoning: null,
    supervisor: "RENA",
    perryApproval: "Not Reviewed",
    responseState: "No Response",
    normalizedSampleStatus: "Not Sent",
    nextFollowUpDate: null,
    outreachHistory: [],
  };
}

export function getTestCreatorRow(id: string): CreatorRow | undefined {
  const t = getTestCreator(id);
  return t ? testCreatorToRow(t) : undefined;
}

export function listTestCreatorRows(): CreatorRow[] {
  return cache.map(testCreatorToRow);
}

// Test creators use the id prefix "TEST-", which the existing
// isTestCreatorId() selector in creator-workspace already recognises.
export function isTestCreatorEntry(id: string): boolean {
  return id.startsWith("TEST-");
}
