import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuthStore } from "../stores/auth.store";
import { AuthShell } from "../Components/auth/AuthShell";
import {
  getSavedAuthRedirect,
  clearSavedAuthRedirect,
  resolveRedirectTarget,
} from "../lib/auth-redirect";

const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/oauth/callback")({
  validateSearch: (search) => searchSchema.parse(search),
  component: OAuthCallbackComponent,
});

function OAuthCallbackComponent() {
  const { token, error, redirect: redirectParam } = Route.useSearch();
  const navigate = useNavigate();
  const { setAccessToken, refreshProfile, clearAuth } = useAuthStore();
  const [statusText, setStatusText] = useState("Finalizing Maison Google Authentication...");

  useEffect(() => {
    if (error) {
      clearAuth();
      setStatusText(`Google Sign-In failed: ${error}`);
      setTimeout(() => navigate({ to: "/login" }), 3000);
      return;
    }

    if (token) {
      setAccessToken(token);
      refreshProfile()
        .then(() => {
          const destination = resolveRedirectTarget(
            redirectParam || getSavedAuthRedirect()
          );
          clearSavedAuthRedirect();
          navigate({ to: destination });
        })
        .catch(() => {
          clearAuth();
          setStatusText("Failed to retrieve curator profile. Returning to entrance...");
          setTimeout(() => navigate({ to: "/login" }), 2000);
        });
    } else {
      clearAuth();
      setStatusText("No member credentials detected. Returning to entrance...");
      setTimeout(() => navigate({ to: "/login" }), 2000);
    }
  }, [token, error, redirectParam, setAccessToken, refreshProfile, clearAuth, navigate]);

  return (
    <AuthShell variant="narrow">
      <div className="py-10 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center text-primary">
          <svg
            className="h-7 w-7 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </div>
        <p
          role="status"
          className="font-eyebrow text-caption uppercase tracking-widest text-muted-foreground"
        >
          {statusText}
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block font-eyebrow text-caption uppercase tracking-wider text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

