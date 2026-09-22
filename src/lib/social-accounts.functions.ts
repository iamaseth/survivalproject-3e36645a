import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SocialPlatform = "tiktok" | "facebook" | "instagram" | "youtube" | "x";
export type SocialAccount = {
  platform: SocialPlatform;
  profile_url: string;
  account_handle: string;
  account_owner: string;
  purpose: string;
  connection_status: "not_connected" | "waiting_for_owner" | "connection_unavailable";
  notes: string;
  updated_at?: string;
};

const platforms: SocialPlatform[] = ["tiktok", "facebook", "instagram", "youtube", "x"];
export const listSocialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("social_accounts").select("platform,profile_url,account_handle,account_owner,purpose,connection_status,notes,updated_at");
    if (error) throw new Error(error.message);
    return { accounts: (data ?? []) as SocialAccount[] };
  });

export const saveSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SocialAccount) => {
    if (!data || !platforms.includes(data.platform)) throw new Error("Invalid platform");
    for (const field of ["profile_url", "account_handle", "account_owner", "purpose", "notes"] as const) {
      if (typeof data[field] !== "string" || data[field].length > 1000) throw new Error("Invalid account information");
    }
    if (data.profile_url) {
      let url: URL;
      try { url = new URL(data.profile_url); } catch { throw new Error("Enter a full HTTPS profile link"); }
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Enter a public HTTPS profile link only");
      const hosts: Record<SocialPlatform, string[]> = {
        tiktok: ["tiktok.com"], facebook: ["facebook.com", "fb.com"], instagram: ["instagram.com"],
        youtube: ["youtube.com", "youtu.be"], x: ["x.com", "twitter.com"],
      };
      if (!hosts[data.platform].some((host) => url.hostname === host || url.hostname.endsWith("." + host))) throw new Error("Profile link does not match platform");
    }
    if (!["not_connected", "waiting_for_owner", "connection_unavailable"].includes(data.connection_status)) throw new Error("Invalid status");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { platform, profile_url, account_handle, account_owner, purpose, connection_status, notes } = data;
    const { error } = await context.supabase.from("social_accounts").upsert({
      platform, profile_url, account_handle, account_owner, purpose, connection_status, notes,
      updated_by: context.userId, updated_at: new Date().toISOString(),
    } as never, { onConflict: "platform" });
    if (error) throw new Error(error.message);
    return { saved: true };
  });
