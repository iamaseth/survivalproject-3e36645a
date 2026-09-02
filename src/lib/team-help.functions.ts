import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type HelpType = "Problem" | "Suggestion" | "Question";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
  };
};

async function resolveChatId(token: string): Promise<string> {
  const configured = process.env.TELEGRAM_CHAT_ID?.trim();
  if (configured) return configured;

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const body = await res.json() as { ok?: boolean; result?: TelegramUpdate[]; description?: string };
  if (!res.ok || !body.ok) throw new Error(body.description || "Could not read Telegram updates");

  const matches = (body.result ?? []).filter((u) =>
    u.message?.chat?.id &&
    u.message?.chat?.type === "private" &&
    (u.message?.text ?? "").trim().toLowerCase() === "ready",
  );
  const chatId = matches.at(-1)?.message?.chat?.id;
  if (!chatId) throw new Error('Telegram is not connected yet. Open the bot and send the word "ready" once.');
  return String(chatId);
}

export const sendTeamHelpAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { type: HelpType; message: string; pageUrl: string; sender: string }) => data)
  .handler(async ({ data }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured in Lovable Cloud Secrets");

    const message = data.message.trim();
    if (!message) throw new Error("Message is required");

    const chatId = await resolveChatId(token);
    const text = [
      `🔔 Survival Tabs CRM — ${data.type}`,
      `From: ${data.sender || "Team member"}`,
      `Page: ${data.pageUrl || "Unknown"}`,
      "",
      message,
    ].join("\n");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const body = await res.json() as { ok?: boolean; description?: string };
    if (!res.ok || !body.ok) throw new Error(body.description || "Telegram send failed");

    return { ok: true };
  });
