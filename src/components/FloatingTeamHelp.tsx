import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/current-user";
import { sendTeamHelpAlert } from "@/lib/team-help.functions";
import { supabase } from "@/integrations/supabase/client";

type HelpType = "Problem" | "Suggestion" | "Question";
type TeamMessage = {
  id: string;
  thread_owner_id: string;
  sender_id: string;
  sender_name: string;
  sender_email: string;
  message_type: string;
  body: string;
  page_url: string | null;
  read_at: string | null;
  created_at: string;
};

const SETH_EMAIL = "thenxyz@gmail.com";

export function FloatingTeamHelp() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HelpType>("Problem");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [renaUserId, setRenaUserId] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const auth = useAuth();
  const profile = auth.status === "authenticated" ? auth.profile : null;
  const isSeth = profile?.email.trim().toLowerCase() === SETH_EMAIL;

  const threads = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; latest: string }>();
    for (const item of messages) {
      const existing = grouped.get(item.thread_owner_id);
      const ownerName = item.sender_id === item.thread_owner_id ? item.sender_name : existing?.name ?? "Team member";
      if (!existing || item.created_at > existing.latest) {
        grouped.set(item.thread_owner_id, { id: item.thread_owner_id, name: ownerName, latest: item.created_at });
      } else if (ownerName !== "Team member") {
        existing.name = ownerName;
      }
    }
    if (isSeth && renaUserId && !grouped.has(renaUserId)) {
      grouped.set(renaUserId, { id: renaUserId, name: "Rena", latest: "" });
    }
    return [...grouped.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [messages, isSeth, renaUserId]);

  const activeThread = isSeth ? selectedThread ?? renaUserId ?? threads[0]?.id ?? null : profile?.userId ?? null;
  const visibleMessages = useMemo(
    () => messages.filter((item) => item.thread_owner_id === activeThread),
    [messages, activeThread],
  );
  const unreadCount = messages.filter((item) => item.sender_id !== profile?.userId && !item.read_at).length;
  const activeThreadName = threads.find((thread) => thread.id === activeThread)?.name ?? (activeThread === renaUserId ? "Rena" : "Team member");

  const loadRena = async () => {
    if (!isSeth) return;
    const { data, error } = await (supabase as any).rpc("get_rena_chat_user_id");
    if (error) {
      setStatus("Could not open Rena's chat yet. Refresh and try again.");
      return;
    }
    if (data) {
      setRenaUserId(data as string);
      setSelectedThread((current) => current ?? (data as string));
    }
  };

  const loadMessages = async () => {
    if (!profile) return;
    const { data, error } = await (supabase as any)
      .from("team_messages")
      .select("id,thread_owner_id,sender_id,sender_name,sender_email,message_type,body,page_url,read_at,created_at")
      .order("created_at", { ascending: true });
    if (error) {
      setStatus("Chat is not available yet. The database update may still be deploying.");
      return;
    }
    const next = (data ?? []) as TeamMessage[];
    setMessages(next);
    if (isSeth && !selectedThread && !renaUserId && next.length) {
      setSelectedThread(next[next.length - 1].thread_owner_id);
    }
  };

  useEffect(() => {
    if (!profile) return;
    if (isSeth) void loadRena();
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), open ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [profile?.userId, open, isSeth]);

  useEffect(() => {
    if (!open || !profile || !activeThread) return;
    const unreadIds = visibleMessages
      .filter((item) => item.sender_id !== profile.userId && !item.read_at)
      .map((item) => item.id);
    if (!unreadIds.length) return;
    void (supabase as any)
      .from("team_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(() => loadMessages());
  }, [open, activeThread, visibleMessages.length, profile?.userId]);

  const sendMessage = async () => {
    if (!profile || !message.trim() || sending) return;
    const threadOwnerId = isSeth ? activeThread : profile.userId;
    if (!threadOwnerId) {
      setStatus("Choose a conversation first.");
      return;
    }

    setSending(true);
    setStatus(null);
    const text = message.trim();
    const pageUrl = typeof window === "undefined" ? pathname : `${window.location.origin}${pathname}`;

    try {
      const { error } = await (supabase as any).from("team_messages").insert({
        thread_owner_id: threadOwnerId,
        sender_id: profile.userId,
        sender_name: profile.fullName,
        sender_email: profile.email,
        message_type: isSeth ? "Reply" : type,
        body: text,
        page_url: pageUrl,
      });
      if (error) throw error;

      setMessage("");
      await loadMessages();

      if (!isSeth) {
        try {
          await sendTeamHelpAlert({ data: { type, message: text, pageUrl, sender: profile.fullName } });
          setStatus("Message sent. Seth was notified.");
        } catch {
          setStatus("Message sent. Seth can see it here; the Telegram alert did not go through.");
        }
      } else {
        setStatus(`Reply sent to ${activeThreadName}.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  if (!profile) return null;

  return <div className="fixed bottom-5 right-5 z-40">
    {open ? <div className="mb-3 flex max-h-[70vh] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <div>
          <div className="font-semibold">Contact Seth now</div>
          <div className="text-xs text-primary-foreground/75">{isSeth ? "Team messages — reply here" : "Chat directly with Seth"}</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/10" aria-label="Close Contact Seth now"><X className="h-4 w-4"/></button>
      </div>

      {isSeth && threads.length > 0 ? <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2">
        {threads.map((thread) => <button key={thread.id} type="button" onClick={() => setSelectedThread(thread.id)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${activeThread === thread.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{thread.name}</button>)}
      </div> : null}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex min-h-[180px] max-h-[320px] flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-secondary/20 p-3">
          {visibleMessages.length === 0 ? <div className="m-auto text-center text-xs text-muted-foreground">{isSeth ? `Start a conversation with ${activeThreadName}.` : "Send Seth a message here. His replies will appear in this conversation."}</div> : visibleMessages.map((item) => {
            const mine = item.sender_id === profile.userId;
            return <div key={item.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-secondary text-secondary-foreground"}`}>
              <div className="mb-1 text-[10px] font-semibold opacity-70">{mine ? "You" : item.sender_name} · {new Date(item.created_at).toLocaleString()}</div>
              <div className="whitespace-pre-wrap break-words">{item.body}</div>
              {!mine && item.message_type !== "Reply" ? <div className="mt-1 text-[10px] opacity-60">{item.message_type}</div> : null}
            </div>;
          })}
        </div>

        {!isSeth ? <label className="mb-3 block"><span className="mb-1 block text-xs font-semibold">What is this about?</span><select value={type} onChange={(e) => setType(e.target.value as HelpType)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>Problem</option><option>Suggestion</option><option>Question</option></select></label> : null}

        <label className="block"><span className="mb-1 block text-xs font-semibold">{isSeth ? `Reply to ${activeThreadName}` : "Message Seth"}</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder={isSeth ? "Type your reply…" : "Type your message…"} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"/></label>
        {!isSeth ? <div className="mt-1 text-[11px] text-muted-foreground">Your name and this page are added automatically.</div> : null}
        {status ? <div className="mt-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">{status}</div> : null}
        <button type="button" disabled={!message.trim() || sending || (isSeth && !activeThread)} onClick={sendMessage} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4"/> {sending ? "Sending…" : isSeth ? "Send reply" : "Send message"}</button>
      </div>
    </div> : null}

    <button type="button" onClick={() => setOpen((v) => !v)} className="relative ml-auto flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xl ring-1 ring-black/10 hover:bg-primary/90" aria-label={open ? "Close Contact Seth now" : "Open Contact Seth now"}>
      {open ? <X className="h-5 w-5"/> : <><MessageCircle className="h-5 w-5"/><span>Contact Seth now</span></>}
      {!open && unreadCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-bold text-destructive-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
    </button>
  </div>;
}
