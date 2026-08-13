// Real authenticated-user hook.
// Permanent team access is email-roster based. On every authenticated load we
// ask Supabase to repair the user's role, then read the profile/role normally.
// A local roster fallback prevents the UI from locking out a known team member
// during a brief DB-sync/migration gap; database RLS is separately roster-aware.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ROLE_LABEL,
  can as roleCan,
  roleToTeamId,
  type AppRole,
  type Permission,
  type TeamMemberId,
} from "./permissions";

const PERMANENT_TEAM: Record<string, { role: AppRole; name: string }> = {
  "atp@globenetcapitalgroup.com": { role: "executive", name: "Perry" },
  "ellezolie@gmail.com":          { role: "executive", name: "Perry" },
  "thenxyz@gmail.com":            { role: "research_manager", name: "Seth" },
  "2phabulous@gmail.com":         { role: "research_manager", name: "Thu" },
  "renas1503@gmail.com":          { role: "partnership_manager", name: "Rena" },
  "vinapanda777@gmail.com":       { role: "partnership_coordinator", name: "Vina" },
  "alvisslohasfarms@gmail.com":   { role: "shopify_content_editor", name: "Tuan (Alvis)" },
  "hoanglohasfarms@gmail.com":    { role: "shopify_content_editor", name: "Hoang" },
};

export interface AuthProfile {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  initials: string;
  role: AppRole | null;
  roleLabel: string;
  teamId: TeamMemberId | null;
  online: boolean;
}

function initialsFrom(name: string, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type State =
  | { status: "loading"; profile: null }
  | { status: "unauthenticated"; profile: null }
  | { status: "authenticated"; profile: AuthProfile };

async function repairCurrentTeamAccess() {
  // Generated types can lag a new RPC by one migration. Use a compatibility
  // cast so deployment is not blocked by stale generated Supabase types.
  try {
    await (supabase as any).rpc("ensure_current_team_access");
  } catch {
    // Best-effort self-heal. Never turn an RPC/version mismatch into lockout.
  }
}

async function fetchProfile(userId: string, email: string, meta: Record<string, unknown>): Promise<AuthProfile> {
  const normalizedEmail = email.trim().toLowerCase();
  const roster = PERMANENT_TEAM[normalizedEmail];

  await repairCurrentTeamAccess();

  const [{ data: profileRow }, { data: roleRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, email").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  const role = ((roleRow?.role as AppRole | undefined) ?? roster?.role) ?? null;
  const fullName =
    roster?.name ??
    profileRow?.full_name ??
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    email;
  const avatarUrl =
    profileRow?.avatar_url ??
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined) ??
    null;

  void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);

  return {
    userId,
    email: profileRow?.email ?? normalizedEmail,
    fullName,
    avatarUrl,
    initials: initialsFrom(fullName, normalizedEmail),
    role,
    roleLabel: role ? ROLE_LABEL[role] : "No role assigned",
    teamId: roleToTeamId(role),
    online: true,
  };
}

export function useAuth(): State & {
  can: (p: Permission) => boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<State>({ status: "loading", profile: null });

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setState({ status: "unauthenticated", profile: null });
      return;
    }

    const profile = await fetchProfile(
      data.user.id,
      data.user.email ?? "",
      (data.user.user_metadata ?? {}) as Record<string, unknown>,
    );
    setState({ status: "authenticated", profile });
  }, []);

  useEffect(() => {
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        void load();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signIn = useCallback(async () => {
    const { lovable } = await import("@/integrations/lovable");
    await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ status: "unauthenticated", profile: null });
  }, []);

  return {
    ...state,
    can: (p) => roleCan(state.profile?.role ?? null, p),
    signIn,
    signOut,
  };
}
