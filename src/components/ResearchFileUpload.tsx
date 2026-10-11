import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { unzipSync, strFromU8 } from "fflate";
import { uploadResearchFiles, type FileResult } from "@/lib/research-files.functions";

const MAX_ZIP = 200 * 1024 * 1024;

export function ResearchFileUpload() {
  const upload = useServerFn(uploadResearchFiles);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState("");

  async function handle(list: FileList | null) {
    if (!list?.length || busy) return;
    setBusy(true); setError(""); setResults([]);
    const files: { fileName: string; md: string }[] = [];
    const out: FileResult[] = [];
    try {
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) {
          if (f.size > MAX_ZIP) { out.push({ fileName: f.name, status: "error", reason: "ZIP too large" }); continue; }
          let entries: Record<string, Uint8Array>;
          try { entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: e => /\.md$/i.test(e.name) && !e.name.startsWith("__MACOSX/") }); }
          catch { out.push({ fileName: f.name, status: "error", reason: "Could not read ZIP" }); continue; }
          for (const [name, bytes] of Object.entries(entries)) files.push({ fileName: name.split("/").pop() || name, md: strFromU8(bytes) });
        } else if (/\.md$/i.test(f.name)) files.push({ fileName: f.name, md: await f.text() });
        else out.push({ fileName: f.name, status: "error", reason: "Only .md or .zip" });
      }
      for (let i = 0; i < files.length; i += 25) {
        setProgress(`${Math.min(i + 25, files.length)} / ${files.length}`);
        const batch = files.slice(i, i + 25);
        try { out.push(...await upload({ data: { files: batch } })); }
        catch (e) { out.push(...batch.map(b => ({ fileName: b.fileName, status: "error" as const, reason: e instanceof Error ? e.message : String(e) }))); }
      }
      if (!files.length && !out.length) setError("No .md files found.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setResults(out); setProgress(""); setBusy(false);
  }

  const count = (s: FileResult["status"]) => results.filter(r => r.status === s).length;
  return <details className="rounded-lg border text-sm">
    <summary className="cursor-pointer px-4 py-2 text-muted-foreground">Upload Research Files</summary>
    <div className="space-y-2 px-4 pb-4">
      <input type="file" multiple accept=".md,.zip,text/markdown,application/zip" disabled={busy}
        onChange={e => { void handle(e.target.files); e.target.value = ""; }} className="block w-full" />
      {busy && <p>Uploading… {progress}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!!results.length && <>
        <p className="font-medium">Imported {count("imported")} · Skipped {count("skipped")} · Errors {count("error")}</p>
        <ul className="max-h-64 overflow-auto text-xs">
          {results.map((r, i) => <li key={i} className={r.status === "error" ? "text-destructive" : r.status === "skipped" ? "text-muted-foreground" : ""}>
            {r.status === "imported" ? "✓" : r.status === "skipped" ? "–" : "✕"} {r.fileName}{r.handle ? ` (@${r.handle})` : ""}{r.reason ? ` — ${r.reason}` : ""}
          </li>)}
        </ul>
      </>}
    </div>
  </details>;
}
