import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuthStore } from "../stores/auth.store";

const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/oauth/callback")({
  validateSearch: (search) => searchSchema.parse(search),
  component: OAuthCallbackComponent,
});

function OAuthCallbackComponent() {
  const { token, error } = Route.useSearch();
  const navigate = useNavigate();
  const { setAccessToken, refreshProfile } = useAuthStore();
  const [statusText, setStatusText] = useState("Finalizing Google Sign-In...");

  useEffect(() => {
    if (error) {
      setStatusText(`Google Sign-In failed: ${error}`);
      setTimeout(() => navigate({ to: "/login" }), 3000);
      return;
    }

    if (token) {
      setAccessToken(token);
      refreshProfile()
        .then(() => {
          navigate({ to: "/profile" });
        })
        .catch(() => {
          setStatusText("Failed to load user profile. Redirecting to login...");
          setTimeout(() => navigate({ to: "/login" }), 2000);
        });
    } else {
      setStatusText("No authentication token found. Redirecting to login...");
      setTimeout(() => navigate({ to: "/login" }), 2000);
    }
  }, [token, error, setAccessToken, refreshProfile, navigate]);

  return (
    <div className="py-20 text-center">
      <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm text-neutral-300 font-medium">{statusText}</p>
    </div>
  );
}
