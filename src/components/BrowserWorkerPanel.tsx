import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, PlugZap, ClipboardPaste } from "lucide-react";

/**
 * Phase 2 (experimental) local Browser Worker connection.
 * Contract: docs/OUTREACH-BROWSER-WORKER.md. The app only ever asks the worker
 * to "Open & Paste" — it never requests a Send action.
 */
const URL_KEY = "outreach-browser-worker-url";
const DEFAULT_URL = "http://127.0.0.1:4317";

type ConnState =
  | { kind: "disconnected" }
  | { kind: "checking" }
  | { kind: "connected"; version: string }
  | { kind: "error"; message: string };

export interface WorkerTarget {
  creatorId: string;
  platform: string;
  profileUrl: string;
  message: string;
}

function blockedHint(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return `Could not reach the worker (${m}). Either it is not running, or your browser blocked this secure page from contacting your computer. Installation has not been done yet.`;
}

export function BrowserWorkerPanel({ target }: { target: WorkerTarget | null }) {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [configured, setConfigured] = useState(false);
  const [conn, setConn] = useState<ConnState>({ kind: "disconnected" });
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(URL_KEY);
    if (saved) { setUrl(saved); setConfigured(true); }
  }, []);

  const base = url.replace(/\/+$/, "");
  const validUrl = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);

  const saveUrl = () => {
    if (!validUrl) { toast.error("Worker URL must be http://127.0.0.1:<port> or http://localhost:<port>"); return; }
    localStorage.setItem(URL_KEY, base);
    setConfigured(true);
    setConn({ kind: "disconnected" });
    toast.success("Worker address saved (this browser only)");
  };
  const clearUrl = () => {
    localStorage.removeItem(URL_KEY);
    setUrl(DEFAULT_URL); setConfigured(false); setConn({ kind: "disconnected" });
  };

  const test = async () => {
    setConn({ kind: "checking" });
    try {
      const res = await fetch(`${base}/health`, { method: "GET", signal: AbortSignal.timeout(4000) });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok === true && typeof json.version === "string") setConn({ kind: "connected", version: json.version });
      else setConn({ kind: "error", message: `Worker answered but not with the expected health response (HTTP ${res.status}).` });
    } catch (e) {
      setConn({ kind: "error", message: blockedHint(e) });
    }
  };

  const openAndPaste = async () => {
    if (!target || conn.kind !== "connected") return;
    setPasting(true);
    try {
      // NOTE: there is intentionally no "send" field. The worker rejects any.
      const res = await fetch(`${base}/open-and-paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
        signal: AbortSignal.timeout(90000),
      });
      const json = await res.json().catch(() => null);
      const status = json?.status ?? `http_${res.status}`;
      if (res.ok && json?.success) toast.success(`Worker: ${status}. Review in the browser and send yourself.`);
      else toast.error(`Worker: ${status}${json?.error ? ` — ${json.error}` : ""}`);
    } catch (e) {
      toast.error(blockedHint(e));
      setConn({ kind: "error", message: blockedHint(e) });
    } finally { setPasting(false); }
  };

  const btn = "inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";
  const label =
    conn.kind === "connected" ? `Connected (v${conn.version})`
    : conn.kind === "checking" ? "Checking…"
    : conn.kind === "error" ? "Not reachable"
    : "Not connected";

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" />Browser Worker <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider">Experimental</span></div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Installation not done yet. Later, a small helper on your Ubuntu computer can open the profile and paste the message. It will <strong>never press Send</strong> — you always review and send yourself.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Local worker URL" />
        <button onClick={saveUrl} className={btn}>Save address</button>
        {configured ? <button onClick={clearUrl} className={btn}>Clear</button> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!configured || conn.kind === "checking"} onClick={test} className={btn}><PlugZap className="h-4 w-4" />Test Browser Worker</button>
        <button disabled={conn.kind !== "connected" || !target || pasting} onClick={openAndPaste} className={btn}><ClipboardPaste className="h-4 w-4" />{pasting ? "Working…" : "Open & Paste"}</button>
      </div>
      {!configured ? <p className="text-xs text-muted-foreground">Save the worker address to enable testing.</p> : null}
      {conn.kind === "error" ? <p className="text-xs text-destructive">{conn.message}</p> : null}
    </section>
  );
}
