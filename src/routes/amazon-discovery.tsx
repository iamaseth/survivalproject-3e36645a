import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/amazon-discovery")({
  beforeLoad: () => {
    throw redirect({ to: "/amazon-creators" });
  },
});
