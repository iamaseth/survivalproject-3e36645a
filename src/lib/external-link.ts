/**
 * External CRM links must be plain anchors that the browser handles natively.
 * Lovable's preview iframe can block JavaScript popups, while a native
 * `target="_blank"` link opens a normal top-level tab.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer",
    referrerPolicy: "no-referrer" as const,
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
    },
  };
}

/** Imperative variant for controls that cannot be native anchors. */
export function openExternal(url: string | null | undefined) {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function outlookComposeUrl(to: string, subject: string, body: string) {
  const params = new URLSearchParams({ to, subject, body });
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}

export function survivalTabsOutreachUrl(email: string, creatorName: string) {
  const firstName = creatorName.split(/[-—|]/)[0].trim();
  const subject = "Survival Tabs creator collaboration";
  const body = `Hi ${firstName},\n\nI'm reaching out from Survival Tabs. We make compact emergency nutrition designed for preparedness, camping and emergency kits, and your content looks like a natural fit.\n\nWe'd be glad to send a complimentary sample with no posting obligation. If you're interested, please reply and we'll share the details.\n\nThanks,\nRena · Survival Tabs`;
  return outlookComposeUrl(email, subject, body);
}
