// Sign-in page with password authentication and temporary Google fallback.
// This route is public; the app-wide gate lives in AppShell so the URL
// doesn't need to change after login.
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/current-user";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Survival Tabs Team Hub" },
      { name: "description", content: "Team-only sign-in for the Survival Tabs Content Hub." },
      { property: "og:title", content: "Sign in — Survival Tabs Team Hub" },
      { property: "og:description", content: "Private team sign-in for Survival Tabs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("thenxyz@gmail.com");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (auth.status === "authenticated") router.navigate({ to: "/" });
  }, [auth.status, router]);

  const onGoogle = async () => {
    setErr(null);
    setBusy(true);
    try { await auth.signIn(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };

  const onPassword = async () => {
    setErr(null);
    setBusy(true);
    try { await auth.signInWithPassword(email, password); }
    catch (e) { setErr(e instanceof Error ? e.message : "Password sign-in failed"); }
    finally { setBusy(false); }
  };

  return <SignInCard busy={busy} error={err} onGoogle={onGoogle} onPassword={onPassword} email={email} setEmail={setEmail} password={password} setPassword={setPassword} />;
}

export function SignInCard({
  busy, error, onGoogle, onPassword, email, setEmail, password, setPassword,
}: { busy: boolean; error: string | null; onGoogle: () => void; onPassword: () => void; email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--gold)]">Survival Tabs</div>
        <h1 className="font-display text-3xl leading-tight text-foreground">Team Content Hub</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Private Survival Tabs workspace. Sign in with your email and password.
        </p>
        <form onSubmit={(event) => { event.preventDefault(); void onPassword(); }} className="mt-6 space-y-3">
          <label className="block text-sm">Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-3" /></label>
          <label className="block text-sm">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-3" /></label>
          <button type="submit" disabled={busy} className="w-full rounded-md bg-foreground px-4 py-3 text-background disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <button
          onClick={onGoogle}
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleMark />
          {busy ? "Please wait…" : "Google sign-in (temporary fallback)"}
        </button>
        {error ? (
          <p className="mt-3 text-xs text-red-600">{error}</p>
        ) : null}
        <p className="mt-6 text-[11px] text-muted-foreground">
          Password sign-in requires an existing Supabase account with a password. No password is stored in this app.
        </p>
        <div className="mt-4 flex items-center justify-center gap-1 text-muted-foreground/70">
          <LogIn className="h-3 w-3" />
          <span className="text-[10px] uppercase tracking-[0.22em]">Private sign-in</span>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 19 13 24 13c3.1 0 5.9 1.2 8 3l5.7-5.7C34 5.1 29.3 3 24 3 16.3 3 9.7 7.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 36 24 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 40.5 16.2 45 24 45z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.9 35.7 45 30.3 45 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
