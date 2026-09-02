import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/current-user";
import { sendTeamHelpAlert } from "@/lib/team-help.functions";

type HelpType = "Problem" | "Suggestion" | "Question";

export function FloatingTeamHelp() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HelpType>("Problem");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const auth = useAuth();
  const sender = auth.status === "authenticated" ? auth.profile.fullName : "Survival Tabs team member";

  const sendAlert = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const pageUrl = typeof window === "undefined" ? pathname : `${window.location.origin}${pathname}`;
      await sendTeamHelpAlert({ data: { type, message: message.trim(), pageUrl, sender } });
      setMessage("");
      setStatus("Sent to Seth on Telegram.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send Telegram alert.");
    } finally {
      setSending(false);
    }
  };

  return <div className="fixed bottom-5 right-5 z-40">
    {open ? <div className="mb-3 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <div><div className="font-semibold">Help & feedback</div><div className="text-xs text-primary-foreground/75">Send Seth a Telegram alert</div></div>
        <button type="button" onClick={()=>setOpen(false)} className="rounded-md p-1 hover:bg-white/10" aria-label="Close help"><X className="h-4 w-4"/></button>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">If work is blocked or you have a suggestion, send it here. You do not need Telegram on this computer.</div>
        <label className="block"><span className="mb-1 block text-xs font-semibold">What is this about?</span><select value={type} onChange={(e)=>setType(e.target.value as HelpType)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>Problem</option><option>Suggestion</option><option>Question</option></select></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold">Message</span><textarea value={message} onChange={(e)=>setMessage(e.target.value)} rows={5} placeholder="Describe what happened or what you suggest…" className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"/></label>
        <div className="text-[11px] text-muted-foreground">Your name and this page are added automatically.</div>
        {status ? <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">{status}</div> : null}
        <button type="button" disabled={!message.trim() || sending} onClick={sendAlert} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4"/> {sending ? "Sending…" : "Send alert"}</button>
        <div className="text-center text-[11px] text-muted-foreground">Urgent backup: WhatsApp +855 69 859 870 · Viber +84 36 7649513</div>
      </div>
    </div>:null}
    <button type="button" onClick={()=>setOpen((v)=>!v)} className="ml-auto flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xl ring-1 ring-black/10 hover:bg-primary/90" aria-label={open?"Close help and feedback":"Open help and feedback"}>{open?<X className="h-5 w-5"/>:<><MessageCircle className="h-5 w-5"/><span>Help & feedback</span></>}</button>
  </div>;
}
