/**
 * External CRM links must open in a separate browser tab rather than inside
 * the Lovable app/preview. A normal anchor with target="_blank" is the most
 * reliable user-gesture navigation and avoids attempting to embed YouTube.
 */
export function externalLinkProps(url: string | null | undefined) {
  return {
    href: url ?? undefined,
    target: "_blank" as const,
    rel: "noopener noreferrer external",
  };
}
