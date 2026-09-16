import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/personal-collection")({
  beforeLoad: () => {
    throw redirect({ to: "/collection" });
  },
});
