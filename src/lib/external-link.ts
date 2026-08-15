/**
 * KISS external-link behavior used by CRM pages.
 * In Lovable preview the app runs inside an iframe. Using _blank can create
 * another sandboxed frame/tab where sites such as YouTube refuse to load.
 * _top escapes the preview frame on a user click and opens the real external
 * site directly. On the published app it simply navigates the current tab.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_top" as const,
    rel: "noopener noreferrer",
    referrerPolicy: "no-referrer" as const,
    onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  };
}
