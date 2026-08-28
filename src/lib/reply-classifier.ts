export type ReplyCategory =
  | "interested"
  | "ask_price"
  | "ask_sample"
  | "rejected"
  | "posted"
  | "needs_human"
  | "invalid";

export type ReplyRiskFlag =
  | "price_commitment"
  | "sample_commitment"
  | "shipping_commitment"
  | "inventory_commitment";

export interface ReplyClassification {
  category: ReplyCategory;
  confidence: number;
  riskFlags: ReplyRiskFlag[];
  nextAction: string;
  requiresHumanReview: boolean;
}

const has = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

export function classifyCreatorReplyDeterministically(input: string): ReplyClassification {
  const text = input.trim().toLowerCase();

  if (!text || text.length < 2) {
    return {
      category: "invalid",
      confidence: 0.95,
      riskFlags: [],
      nextAction: "Review or ignore invalid/empty reply.",
      requiresHumanReview: true,
    };
  }

  const riskFlags: ReplyRiskFlag[] = [];
  if (has(text, [/\b(price|rate|rates|fee|fees|pay|payment|paid|commission|quote|budget|cost)\b/i])) {
    riskFlags.push("price_commitment");
  }
  if (has(text, [/\b(sample|samples|free product|free pack|try it|send me)\b/i])) {
    riskFlags.push("sample_commitment");
  }
  if (has(text, [/\b(ship|shipping|delivery|deliver|address|tracking|eta|arrive)\b/i])) {
    riskFlags.push("shipping_commitment");
  }
  if (has(text, [/\b(stock|inventory|available|availability|in stock)\b/i])) {
    riskFlags.push("inventory_commitment");
  }

  let category: ReplyCategory = "needs_human";
  let confidence = 0.58;
  let nextAction = "Review reply and decide the next action.";

  if (has(text, [/\b(no thanks|not interested|pass|decline|declined|not a fit|remove me|unsubscribe)\b/i])) {
    category = "rejected";
    confidence = 0.92;
    nextAction = "Mark declined/inactive and stop follow-ups.";
  } else if (has(text, [/\b(posted|published|uploaded|video is live|went live|here is the video|review is live)\b/i])) {
    category = "posted";
    confidence = 0.9;
    nextAction = "Review the published content and record the URL.";
  } else if (riskFlags.includes("price_commitment")) {
    category = "ask_price";
    confidence = 0.86;
    nextAction = "Human review required before discussing price, rate, payment, or commission.";
  } else if (riskFlags.includes("sample_commitment") || riskFlags.includes("shipping_commitment")) {
    category = "ask_sample";
    confidence = 0.84;
    nextAction = "Human review required before promising a sample, shipping, or delivery timing.";
  } else if (has(text, [/\b(interested|sounds good|sounds great|yes|sure|let's do it|would love|happy to|tell me more|more info)\b/i])) {
    category = "interested";
    confidence = 0.82;
    nextAction = "Review and continue the conversation; confirm any business terms manually.";
  }

  // Rejections/unsubscribes must be surfaced to a person so pending
  // follow-ups can be stopped, even though nothing is auto-sent.
  const requiresHumanReview =
    category === "needs_human" || category === "rejected" || riskFlags.length > 0;


  return { category, confidence, riskFlags, nextAction, requiresHumanReview };
}
