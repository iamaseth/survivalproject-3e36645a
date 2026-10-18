// Only the newest identity check may update the visible session.
export function createAuthLoadGuard() {
  let revision = 0;
  return {
    begin: () => ++revision,
    invalidate: () => { revision++; },
    isCurrent: (request: number) => request === revision,
  };
}

// OAuth must return to this origin's public URL, never carry callback tokens.
export function signInReturnUrl(origin: string, pathname: string, search: string) {
  const path = pathname === "/auth" ? "/" : pathname;
  const target = new URL(path + search, origin);
  if (target.origin !== origin || !path.startsWith("/") || path.startsWith("//")) return origin;
  for (const key of ["access_token", "refresh_token", "code", "error", "error_description"]) target.searchParams.delete(key);
  return target.href;
}