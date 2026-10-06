import { createFileRoute, redirect, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/feed" });
  },
  component: () => <Navigate to="/feed" replace />,
});
