import { createFileRoute } from "@tanstack/react-router";
import { DmQueue } from "./rena-queue";

export const Route = createFileRoute("/seth-queue")({
  head: () => ({
    meta: [
      { title: "Seth Outreach — Survival Tabs" },
      { name: "theme-color", content: "#173c2c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Seth Outreach" },
      { name: "description", content: "Seth's mobile TikTok outreach queue." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <DmQueue sender="Seth" />,
});
