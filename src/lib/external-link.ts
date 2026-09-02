/**
 * External CRM links must be plain anchors that the browser handles natively.
 *
 * Inside the Lovable preview the app runs in a sandboxed iframe. A JS
 * `window.open(...)` popup inherits that sandbox, so the target site's
 * X-Frame-Options blocks it (ERR_BLOCKED_BY_RESPONSE). A native
 * `target="_blank"` click opens a real top-level tab instead, which loads fine.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer",
    onClick: (event: { stopPropagation: () => void }) => {
      // Keep the native navigation; only stop parent row handlers.
      event.stopPropagation();
    },
  };
}

/** Imperative variant for buttons that cannot be anchors. */
export function openExternal(url: string | null | undefined) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
