// Pure, client-safe helpers for the Creator Outreach v2 staging phase.
// Nothing in this module sends email.

export type QueueStatus =
  | "pending"
  | "approved"
  | "sending"
  | "sent"
  | "failed"
  | "skipped"
  | "cancelled";

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export interface SequenceStepConfig {
  step: number;
  label: string;
  offsetDays: number;
}

/** Modelled only. Automated sending stays disabled until mailbox verification. */
export const SEQUENCE_STEPS: SequenceStepConfig[] = [
  { step: 1, label: "Initial outreach", offsetDays: 0 },
  { step: 2, label: "Follow-up 1 (+5 days)", offsetDays: 5 },
  { step: 3, label: "Follow-up 2 (+10 days)", offsetDays: 10 },
];

export function sequenceLabel(step: number) {
  return SEQUENCE_STEPS.find((s) => s.step === step)?.label ?? `Step ${step}`;
}

export function idempotencyKey(campaignId: string, creatorId: string, step: number) {
  return `${campaignId}:${creatorId}:${step}`;
}

export function notBeforeFor(step: number, from = new Date()) {
  const cfg = SEQUENCE_STEPS.find((s) => s.step === step);
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + (cfg?.offsetDays ?? 0));
  return d.toISOString();
}

export const TERMINAL_STATUSES: QueueStatus[] = ["sent", "cancelled", "skipped"];

export function isEditableStatus(status: QueueStatus) {
  return !TERMINAL_STATUSES.includes(status);
}
