import type { MouseEvent } from "react";

/**
 * Opens a URL as a true top-level external navigation, breaking out of any
 * embedded preview/iframe context (Lovable preview blocks framed youtube.com).
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
    /* fall through */
  }
  try {
    // Fallback: navigate the top-most browsing context.
    if (window.top && window.top !== window.self) {
      window.top.location.href = href;
      return;
    }
  } catch {
    /* cross-origin top: fall through */
  }
  window.location.href = href;
}

export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer external",
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openExternal(url);
    },
  };
}
