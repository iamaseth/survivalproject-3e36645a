/**
 * External links in the Lovable preview/editor must navigate the top-level
 * browsing context. Sites such as YouTube refuse to render inside an iframe.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_top" as const,
    rel: "noopener noreferrer external",
  };
}
