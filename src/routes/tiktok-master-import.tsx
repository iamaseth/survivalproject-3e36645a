import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { importTikTokMasterChunk, type MasterRow, type RowResult } from "@/lib/tiktok-master-import.functions";

export const Route = createFileRoute("/tiktok-master-import")({
  head: () => ({
    meta: [
      { title: "TikTok Master Import — Survival Tabs" },
      { name: "description", content: "Safely import the TikTok creator qualification master CSV with a preview first." },
      { property: "og:title", content: "TikTok Master Import — Survival Tabs" },
      { property: "og:description", content: "Preview-first, non-destructive TikTok qualification import." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportPage,
});

const FIELDS: Record<keyof Omit<MasterRow, "line">, string[]> = {
  id: ["creatorid", "id", "crmid"],
  profile: ["tiktokurl", "profileurl", "tiktokprofile", "tiktok", "url", "tiktokhandle", "handle", "profile"],
  name: ["creator", "name", "displayname", "creatorname"],
  qualification: ["qualificationstatus", "qualification", "finalqualification", "decision", "status"],
  dm: ["personalizeddm", "firstdm", "dm", "message", "personalizedmessage"],
  evidence: ["newscreeningevidence", "verificationevidence", "reviewevidence", "evidence", "profileevidence"],
  reviewer: ["reviewer", "reviewedby", "verifiedby"],
  reviewDate: ["reviewdate", "verifieddate", "verificationdate", "reviewedat", "verifiedat"],
  decision: ["newscreeningdecision", "screeningdecision"],
  publicUrl: ["publicevidenceurl", "evidenceurl"],
  method: ["screeningmethod"],
  verified: ["verified", "profileverified", "verifiedfordm", "humanverified", "manuallyverified"],
};

function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); out.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}

const key = (h: string) => h.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function ImportPage() {
  const run = useServerFn(importTikTokMasterChunk);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [createMissing, setCreateMissing] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [preview, setPreview] = useState<RowResult[] | null>(null);
  const [applied, setApplied] = useState<RowResult[] | null>(null);
  const [error, setError] = useState("");

  const onFile = async (f: File) => {
    setError(""); setPreview(null); setApplied(null); setFileName(f.name);
    const grid = parseCsv(await f.text());
    if (grid.length < 2) { setError("The file has no data rows."); return; }
    const headers = grid[0].map(key);
    const idx: Record<string, number> = {}; const map: Record<string, string | null> = {};
    for (const [field, names] of Object.entries(FIELDS)) {
      const i = names.map((n) => headers.indexOf(n)).find((x) => x >= 0) ?? -1;
      idx[field] = i; map[field] = i >= 0 ? grid[0][i] : null;
    }
    setMapping(map);
    if (idx.profile < 0 && idx.id < 0) { setError("No TikTok profile or creator ID column found."); setRows([]); return; }
    setRows(grid.slice(1).map((r, n) => {
      const o: MasterRow = { line: n + 2 };
      for (const field of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) if (idx[field] >= 0) (o as any)[field] = r[idx[field]] ?? "";
      return o;
    }));
  };

  const go = async (dryRun: boolean) => {
    if (busy || !rows.length) return;
    if (!dryRun && !confirm(`Apply import of ${rows.length} rows? Only empty fields are filled; nothing is overwritten.`)) return;
    setBusy(true); setError("");
    const all: RowResult[] = []; let seen: string[] = [];
    try {
      for (let i = 0; i < rows.length; i += 200) {
        setProgress(`${dryRun ? "Previewing" : "Importing"} rows ${i + 1}–${Math.min(i + 200, rows.length)} of ${rows.length}…`);
        const r = await run({ data: { rows: rows.slice(i, i + 200), dryRun, createMissing, seenHandles: seen, batchLabel } });
        all.push(...r.results); seen = [...seen, ...r.handles];
      }
      dryRun ? setPreview(all) : setApplied(all);
      if (!dryRun) setPreview(null);
    } catch (e) { setError(`${e instanceof Error ? e.message : "Import failed"}${!dryRun ? " — rows before this point were saved; re-running is safe." : ""}`); }
    finally { setBusy(false); setProgress(""); }
  };

  const summary = (rs: RowResult[]) => {
    const n = (p: (r: RowResult) => boolean) => rs.filter(p).length;
    return [
      ["Rows", rs.length], ["Matched, will update", n((r) => r.outcome === "updated")], ["Matched, no change", n((r) => r.outcome === "unchanged")],
      ["Good (screening)", n((r) => /^good$/i.test(r.decision || ""))], ["Good + DM ready", n((r) => /^good$/i.test(r.decision || "") && r.dmReady)],
      ["Good, no DM", n((r) => /^good$/i.test(r.decision || "") && !r.dmReady)], ["Needs direct TikTok verification", n((r) => r.needsDirectVerification)],
      ["New creators", n((r) => r.outcome === "new")], ["Not in CRM (skipped)", n((r) => r.outcome === "new_skipped")],
      ["Verified → Rena", n((r) => r.changes.includes("verified for Rena") || (r.outcome === "new" && r.verified))],
      ["Good but unverified", n((r) => r.goodUnverified)], ["Conflicts (CRM kept)", n((r) => r.conflicts.length > 0 && r.outcome !== "invalid")],
      ["Duplicates in file", n((r) => r.outcome === "duplicate_in_file")], ["Invalid", n((r) => r.outcome === "invalid")],
    ] as const;
  };

  const shown = applied ?? preview;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="font-display text-3xl text-foreground">TikTok Master Import</h1>
        <p className="text-sm text-muted-foreground">Upload the latest qualification master CSV. Preview first. Only empty fields are filled — existing statuses, DMs, contact history and reviews are never changed. Safe to re-upload as batches finish.</p>
      </div>
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        {fileName ? <div className="text-sm">{fileName}: <b>{rows.length}</b> rows</div> : null}
        {Object.keys(mapping).length ? (
          <div className="grid gap-1 text-xs sm:grid-cols-3">
            {Object.entries(mapping).map(([k, v]) => <div key={k}><span className="text-muted-foreground">{k}:</span> {v ?? <i className="text-muted-foreground">not found</i>}</div>)}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">A row goes to Rena only if: qualification is Qualified, a "verified" column says yes, plus a reviewer name, a review date (YYYY-MM-DD) and at least 40 characters of evidence. Everything else stays "good but unverified" for the TikTok DM Review page.</p>
        <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-950">Screening decisions ("Good") come from public indexed sources, not a direct TikTok check. They are saved as screening notes only and never put anyone on Rena's list. "Draft DM - Do Not Send" is ignored.</p>
        <label className="block text-sm">Batch label (e.g. Batch 24)
          <input value={batchLabel} onChange={(e) => { setBatchLabel(e.target.value); setPreview(null); }} className="mt-1 block rounded-md border border-input bg-background p-2 text-sm" placeholder="Batch 24" />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createMissing} onChange={(e) => { setCreateMissing(e.target.checked); setPreview(null); }} />Also add creators not yet in the CRM</label>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !rows.length} onClick={() => void go(true)} className="rounded-md border border-input px-4 py-2 text-sm font-semibold disabled:opacity-40">1. Preview (no changes)</button>
          <button disabled={busy || !preview} onClick={() => void go(false)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">2. Apply import</button>
        </div>
        {progress ? <div className="text-sm">{progress}</div> : null}
        {error ? <div className="rounded-md border border-destructive p-2 text-sm text-destructive">{error}</div> : null}
      </section>
      {shown ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">{applied ? "Import applied" : "Preview — nothing saved yet"}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {summary(shown).map(([l, n]) => <div key={l} className="rounded-md bg-secondary/40 p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-lg font-semibold">{n}</div></div>)}
          </div>
          <div className="max-h-[420px] overflow-auto text-xs">
            <table className="w-full"><thead><tr className="text-left text-muted-foreground"><th>Line</th><th>Handle</th><th>Decision</th><th>Result</th><th>Changes</th><th>Conflicts</th></tr></thead>
              <tbody>{shown.filter((r) => r.outcome !== "unchanged" || r.conflicts.length).slice(0, 500).map((r) => (
                <tr key={r.line} className="border-t border-border align-top"><td>{r.line}</td><td>{r.handle ? `@${r.handle}` : r.id}</td><td>{r.decision}</td><td>{r.outcome}{r.needsDirectVerification ? " · needs direct check" : ""}</td><td>{r.changes.join("; ")}</td><td>{r.conflicts.join("; ")}</td></tr>
              ))}</tbody></table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
