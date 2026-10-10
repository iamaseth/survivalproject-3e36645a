import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/creators")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/creators") {
      throw redirect({ to: "/" });
    }
  },
});
