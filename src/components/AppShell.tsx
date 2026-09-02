import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Megaphone,
  MessageSquare,
  FileText,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User as UserIcon,
  ClipboardCheck,
} from "lucide-react";

import { useAuth } from "@/lib/current-user";
import { setCurrentActor, hydrateWorkspaceFromDB } from "@/lib/creator-workspace";
import { hydrateCreatorsFromDB } from "@/lib/creator-partnerships";
import { SignInCard } from "@/routes/auth";
import { TestModeBanner } from "@/components/TestModeBanner";
import { FloatingTeamHelp } from "@/components/FloatingTeamHelp";

const navSections = [
  {
    label: null,
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Creators",
    items: [
      { to: "/creators", label: "All Creators", icon: Users },
      { to: "/reviewed-survival-tabs-mre", label: "Reviewed Creators", icon: ClipboardCheck },
      { to: "/amazon-creators", label: "Amazon Creators", icon: ShoppingBag },
    ],
  },
  {
    label: "Outreach",
    items: [
      { to: "/campaigns", label: "Campaigns", icon: Megaphone },
      { to: "/creators/outreach", label: "Bulk Outreach", icon: ClipboardCheck },
      { to: "/communications", label: "Messages", icon: MessageSquare },
      { to: "/templates", label: "Email Templates", icon: FileText },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === "authenticated" && auth.profile.teamId) {
      setCurrentActor({
        id: auth.profile.teamId,
        name: auth.profile.fullName,
        roleLabel: auth.profile.roleLabel,
        email: auth.profile.email,
      });
    } else {
      setCurrentActor(null);
    }
  }, [auth]);

  useEffect(() => {
    if (auth.status === "authenticated" && auth.profile.role) {
      void hydrateWorkspaceFromDB();
      void hydrateCreatorsFromDB();
    }
  }, [auth.status, auth.profile?.role]);

  // Gmail background polling is intentionally disabled here.
  // See docs/HOTFIX-2026-08-12-GMAIL-BACKGROUND-POLLING.md before restoring.

  if (auth.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (auth.status === "unauthenticated") {
    return <InlineSignIn auth={auth} />;
  }

  if (!auth.profile.role) {
    return <NoAccess email={auth.profile.email} onSignOut={auth.signOut} />;
  }

  return (
    <div className="grid min-h-screen w-full grid-cols-[240px_minmax(0,1fr)] bg-background">
      <aside className="sticky top-0 flex h-screen flex-col bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-sidebar-primary">Survival Tabs</div>
          <div className="font-display text-xl leading-tight text-sidebar-foreground">Creator CRM</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navSections.map((section, sectionIndex) => (
            <div key={section.label ?? "home"} className={sectionIndex === 0 ? "" : "mt-5"}>
              {section.label ? (
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
                  {section.label}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = "exact" in item && item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TestModeBanner />
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/85 px-8 py-3 backdrop-blur">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search…"
              className="w-full max-w-sm rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <button className="relative rounded-md border border-border bg-card p-2 hover:bg-secondary">
            <Bell className="h-4 w-4" />
          </button>
          <ProfileMenu
            fullName={auth.profile.fullName}
            email={auth.profile.email}
            roleLabel={auth.profile.roleLabel}
            initials={auth.profile.initials}
            avatarUrl={auth.profile.avatarUrl}
            onSignOut={auth.signOut}
          />
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
      <FloatingTeamHelp />
    </div>
  );
}

function InlineSignIn({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onGoogle = async () => {
    setErr(null); setBusy(true);
    try { await auth.signIn(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };
  return <SignInCard busy={busy} error={err} onGoogle={onGoogle} />;
}

function NoAccess({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--gold)]">Access needed</div>
        <h1 className="font-display text-2xl text-foreground">You're signed in, but not on the team list</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email}</span> isn't mapped to a Survival Tabs role yet.
          Ask a team admin to add you.
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProfileMenu({
  fullName, email, roleLabel, initials, avatarUrl, onSignOut,
}: {
  fullName: string; email: string; roleLabel: string; initials: string;
  avatarUrl: string | null; onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-1.5 hover:bg-secondary"
      >
        <div className="relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {initials}
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
        </div>
        <div className="min-w-0 leading-tight text-left">
          <div className="truncate text-sm font-medium">{fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{fullName}</div>
              <div className="truncate text-xs text-muted-foreground">{email}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[color:var(--forest)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online · {roleLabel}
              </div>
            </div>
          </div>
          <div className="py-1">
            <MenuItem icon={UserIcon} label="Profile" onClick={() => { setOpen(false); navigate({ to: "/settings" }); }} />
            <MenuItem icon={SettingsIcon} label="Settings" onClick={() => { setOpen(false); navigate({ to: "/settings" }); }} />
          </div>
          <div className="border-t border-border pt-1">
            <MenuItem
              icon={LogOut}
              label="Sign out"
              onClick={async () => { setOpen(false); await onSignOut(); }}
              danger
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: { icon: typeof UserIcon; label: string; onClick: () => void | Promise<void>; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary ${danger ? "text-red-600" : ""}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
