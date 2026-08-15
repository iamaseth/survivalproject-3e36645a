/**
 * External CRM links must remain real anchors so right-click / open-in-new-tab
 * always works. On a normal left click, explicitly open a new browser tab.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer",
    referrerPolicy: "no-referrer" as const,
    onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
      if (!url) return;
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
    },
  };
}
