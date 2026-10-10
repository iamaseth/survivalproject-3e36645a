import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/bobo-research")({
  beforeLoad: () => { throw redirect({ to: "/bobo-queue" }); },
});
