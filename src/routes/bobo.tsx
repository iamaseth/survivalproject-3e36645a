import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bobo")({
  beforeLoad: () => {
    throw redirect({ to: "/bobo-research" });
  },
});
