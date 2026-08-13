import type { MouseEvent } from "react";

/**
 * Opens a URL as a true external navigation. This avoids sites such as
 * YouTube being loaded inside Lovable's embedded preview iframe, where they
 * refuse to render and return ERR_BLOCKED_BY_RESPONSE.
 */
export function openExternal(url: string | null | undefined) {
  if (!url) return;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  try {
    const win = window.open(href, "_blank", "noopener,noreferrer");
    if (win) {
      win.opener = null;
      return;
    }
  } catch {
    // Fall through to top-level navigation.
  }

  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = href;
      return;
    }
  } catch {
    // Cross-origin iframe: fall through to current-window navigation.
  }

  window.location.href = href;
}

export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer external",
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      event.stopPropagation();
      openExternal(url);
    },
  };
}
