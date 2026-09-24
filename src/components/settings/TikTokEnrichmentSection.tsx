import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { importTikTokEnrichment, type TikTokEnrichmentRow } from "@/lib/tiktok-enrichment.functions";

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

function parseRows(text: string): TikTokEnrichmentRow[] {
  const [head, ...lines] = parseCsv(text);
  if (!head) return [];
  const names = head.map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase());
  const pick = (r: string[], ...aliases: string[]) => {
    const index = aliases.map(a => names.indexOf(a)).find(i => i >= 0);
    return index === undefined ? "" : (r[index] ?? "").trim();
  };
  if (!["tiktok", "profile url", "profile_url"].some(h => names.includes(h))) throw new Error("TikTok or Profile URL column required");
  return lines.map(r => ({
    tiktok: pick(r, "tiktok", "profile url", "profile_url"),
    source_url: pick(r, "source url", "source_url"),
    search_term: pick(r, "search term", "search_term"),
    evidence: pick(r, "evidence", "post evidence", "post text"),
    reach_signal: pick(r, "reach signal", "reach_signal"),
    monetization: pick(r, "monetization", "commercial signal"),
    segment: pick(r, "segment", "niche"),
  }));
}

type Result = { total: number; matched: number; updated: number; unchanged: number; missing: number; duplicates: number; invalid: number; repeated: number; conflicts: number; dryRun: boolean; review: Array<{ tiktok: string; reason: string }> };

export function TikTokEnrichmentSection() {
  const run = useServerFn(importTikTokEnrichment);
  const [rows, setRows] = useState<TikTokEnrichmentRow[]>([]);
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (file: File | undefined) => {
    setRows([]); setPreview(null); setResult(null);
    if (!file) return;
    try {
      const parsed = parseRows(await file.text());
      if (!parsed.length || parsed.length > 1000) throw new Error("CSV must contain 1–1000 enrichment rows");
      setRows(parsed);
      toast.success(`${parsed.length} enrichment rows loaded. Preview before applying.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Invalid CSV"); }
  };
  const execute = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const res = await run({ data: { rows, dryRun } });
      if (dryRun) { setPreview(res); setResult(null); } else { setResult(res); setPreview(null); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Enrichment failed"); }
    finally { setBusy(false); }
  };
  return <section className="rounded-lg border border-border bg-card p-4 space-y-3">
    <h2 className="font-display text-lg">TikTok creator enrichment</h2>
    <p className="text-xs text-muted-foreground">Upload enrichment CSV with TikTok, Source URL, Search Term, Evidence, Reach Signal, Monetization and Niche columns. Exact TikTok matches only. Missing creators and duplicate CRM identities are flagged; existing verified fields and outreach history are preserved. No new creators are added.</p>
    <input type="file" accept=".csv,text/csv" onChange={e => void load(e.target.files?.[0])} className="block w-full text-xs" />
    <div className="flex gap-2">
      <button className="rounded-md border px-3 py-2 text-xs disabled:opacity-50" disabled={busy || !rows.length} onClick={() => void execute(true)}>Preview {rows.length} rows</button>
      <button className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs disabled:opacity-50" disabled={busy || !preview || preview.total !== rows.length} onClick={() => void execute(false)}>Apply enrichment</button>
    </div>
    {[preview, result].filter(Boolean).map((r, i) => <div key={i} className="rounded-md border p-3 text-xs space-y-1">
      <strong>{r!.dryRun ? "Preview (no changes)" : "Enrichment result"}</strong>
      <p>{r!.matched} matched · {r!.updated} {r!.dryRun ? "would update" : "updated"} · {r!.unchanged} unchanged · {r!.missing} missing · {r!.duplicates} duplicate identities · {r!.invalid} invalid · {r!.repeated} repeated · {r!.conflicts} existing-field differences preserved</p>
      {r!.review.length > 0 && <details><summary>Review {r!.review.length} flagged rows</summary><div className="max-h-40 overflow-auto">{r!.review.map((item, j) => <p key={j}>{item.tiktok}: {item.reason}</p>)}</div></details>}
    </div>)}
  </section>;
}
