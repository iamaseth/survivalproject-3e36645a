import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listSocialAccounts, saveSocialAccount, type SocialAccount, type SocialPlatform } from "@/lib/social-accounts.functions";

export const Route = createFileRoute("/social-accounts")({
  component: SocialAccountsPage,
  head: () => ({ meta: [{ title: "Social Accounts — Survival Tabs" }, { name: "robots", content: "noindex, nofollow" }] }),
});
const platforms: { id: SocialPlatform; name: string; home: string }[] = [
  { id: "tiktok", name: "TikTok", home: "https://www.tiktok.com/" },
  { id: "facebook", name: "Facebook", home: "https://www.facebook.com/" },
  { id: "instagram", name: "Instagram", home: "https://www.instagram.com/" },
  { id: "youtube", name: "YouTube", home: "https://www.youtube.com/" },
  { id: "x", name: "X", home: "https://x.com/" },
];
function blank(platform: SocialPlatform): SocialAccount {
  return { platform, profile_url: "", account_handle: "", account_owner: "", purpose: "", connection_status: "not_connected", notes: "" };
}
function SocialAccountsPage() {
  const list = useServerFn(listSocialAccounts);
  const save = useServerFn(saveSocialAccount);
  const [accounts, setAccounts] = useState<Record<SocialPlatform, SocialAccount>>(() => Object.fromEntries(platforms.map(p => [p.id, blank(p.id)])) as Record<SocialPlatform, SocialAccount>);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<SocialPlatform | null>(null);
  useEffect(() => {
    let active = true;
    list().then(({ accounts: rows }) => {
      if (!active) return;
      setAccounts(prev => { const next = { ...prev }; for (const row of rows) next[row.platform] = row; return next; });
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load account registry"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [list]);
  const change = (platform: SocialPlatform, patch: Partial<SocialAccount>) => setAccounts(prev => ({ ...prev, [platform]: { ...prev[platform], ...patch } }));
  const persist = async (platform: SocialPlatform) => {
    setBusy(platform);
    try { await save({ data: accounts[platform] }); toast.success(platforms.find(p => p.id === platform)?.name + " information saved"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(null); }
  };
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2">
      <Link to="/settings" className="text-sm text-primary hover:underline">← Settings</Link>
      <h1 className="font-display text-3xl">Social Accounts</h1>
      <p className="text-sm text-muted-foreground">Shared account directory for the Survival Tabs team. Add public profile information here; the account owner completes any sign-in and phone verification on the social platform.</p>
    </header>
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>Account connections are not enabled yet.</strong> Saving an account here does not connect it to the CRM, authorize publishing, or sync messages or comments. Do not enter passwords, verification codes, recovery codes, access tokens, or private login instructions in any field. Never send phone codes to a teammate.
    </div>
    {loading ? <p className="text-sm">Loading account directory…</p> : error ? <p role="alert" className="rounded-lg border border-red-300 p-4 text-sm text-red-700">Could not load the shared account directory: {error}. The database migration may not have been applied. Changes cannot be saved until this is resolved.</p> : platforms.map(platform => {
      const account = accounts[platform.id];
      const field = (label: string, key: "profile_url" | "account_handle" | "account_owner" | "purpose" | "notes", placeholder: string) =>
        <label className="block space-y-1 text-sm"><span className="font-medium">{label}</span><input className="w-full rounded-md border border-input bg-background px-3 py-2" value={account[key]} placeholder={placeholder} maxLength={1000} onChange={e => change(platform.id, { [key]: e.target.value })} /></label>;
      return <section key={platform.id} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl">{platform.name}</h2>
          <span className="rounded-full border px-3 py-1 text-xs">{account.connection_status === "waiting_for_owner" ? "Waiting for account owner" : account.connection_status === "connection_unavailable" ? "Connection unavailable" : "Not connected"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {field("Public profile URL", "profile_url", "https://…")}
          {field("Public username / handle", "account_handle", "@survivaltabs")}
          {field("Account owner / contact person", "account_owner", "Who can complete verification?")}
          {field("Used for", "purpose", "Influencer outreach, videos, customer comments…")}
        </div>
        {field("Team notes (no login details)", "notes", "Public account information or next steps only")}
        <label className="block space-y-1 text-sm"><span className="font-medium">Setup status (not an API connection)</span>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={account.connection_status} onChange={e => change(platform.id, { connection_status: e.target.value as SocialAccount["connection_status"] })}>
            <option value="not_connected">Not connected</option>
            <option value="waiting_for_owner">Waiting for account owner</option>
            <option value="connection_unavailable">Connection unavailable / not supported</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy !== null || !!error} onClick={() => void persist(platform.id)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy === platform.id ? "Saving…" : "Save account information"}</button>
          <a href={platform.home} target="_blank" rel="noopener noreferrer" className="rounded-md border border-input px-4 py-2 text-sm hover:bg-secondary">Open {platform.name} to sign in ↗</a>
        </div>
        <p className="text-xs text-muted-foreground">The owner signs in and verifies directly on {platform.name}. An official CRM authorization button can be added only after its integration is configured and tested.</p>
      </section>;
    })}
  </div>;
}
