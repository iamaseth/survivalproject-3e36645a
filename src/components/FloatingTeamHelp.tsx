import { useMemo, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/current-user";
import { externalLinkProps } from "@/lib/external-link";

type HelpType = "Problem" | "Suggestion" | "Question";

export function FloatingTeamHelp() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HelpType>("Problem");
  const [message, setMessage] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const auth = useAuth();
  const sender = auth.status === "authenticated" ? auth.profile.fullName : "Survival Tabs team member";

  const whatsappUrl = useMemo(() => {
    const pageUrl = typeof window === "undefined" ? pathname : `${window.location.origin}${pathname}`;
    const text = [
      `Survival Tabs CRM — ${type}`,
      `From: ${sender}`,
      `Page: ${pageUrl}`,
      "",
      message.trim(),
    ].join("\n");
    return `https://wa.me/85569859870?text=${encodeURIComponent(text)}`;
  }, [message, pathname, sender, type]);

  return <div className="fixed bottom-5 right-5 z-40">
    {open ? <div className="mb-3 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <div><div className="font-semibold">Help & feedback</div><div className="text-xs text-primary-foreground/75">Message Seth through WhatsApp</div></div>
        <button type="button" onClick={()=>setOpen(false)} className="rounded-md p-1 hover:bg-white/10" aria-label="Close help"><X className="h-4 w-4"/></button>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">If work is blocked or Seth does not respond, send a message here right away. WhatsApp Web works from a computer.</div>
        <label className="block"><span className="mb-1 block text-xs font-semibold">What is this about?</span><select value={type} onChange={(e)=>setType(e.target.value as HelpType)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>Problem</option><option>Suggestion</option><option>Question</option></select></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold">Message</span><textarea value={message} onChange={(e)=>setMessage(e.target.value)} rows={5} placeholder="Describe what happened or what you suggest…" className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"/></label>
        <div className="text-[11px] text-muted-foreground">Your name and this page are added automatically. Nothing sends until you confirm in WhatsApp.</div>
        <a {...externalLinkProps(message.trim()?whatsappUrl:undefined)} aria-disabled={!message.trim()} onClick={(e)=>{if(!message.trim())e.preventDefault();e.stopPropagation();}} className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${message.trim()?"bg-[#25D366] text-white hover:bg-[#20bd5a]":"cursor-not-allowed bg-secondary text-muted-foreground"}`}><Send className="h-4 w-4"/> Continue in WhatsApp</a>
        <div className="text-center text-[11px] text-muted-foreground">Urgent backup: WhatsApp +855 69 859 870 · Viber +84 36 7649513</div>
      </div>
    </div>:null}
    <button type="button" onClick={()=>setOpen((v)=>!v)} className="ml-auto flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xl ring-1 ring-black/10 hover:bg-primary/90" aria-label={open?"Close help and feedback":"Open help and feedback"}>{open?<X className="h-5 w-5"/>:<><MessageCircle className="h-5 w-5"/><span>Help & feedback</span></>}</button>
  </div>;
}
