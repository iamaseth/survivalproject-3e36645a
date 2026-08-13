/**
 * KISS external-link behavior used by CRM pages.
 * Keep these as ordinary browser anchors so a left click behaves like
 * "Open link in new tab" and no app/router JavaScript intercepts navigation.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer",
    referrerPolicy: "no-referrer" as const,
    onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  };
}
