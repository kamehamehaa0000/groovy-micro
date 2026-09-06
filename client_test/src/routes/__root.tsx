import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "../stores/auth.store";
import { useGoogleFedCM } from "../hooks/useGoogleFedCM";

export interface RouterContext {
  auth: ReturnType<typeof useAuthStore.getState>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  const { user, isAuthenticated, isLoading, checkAuth, logout } =
    useAuthStore();

  // Native Browser FedCM for Google Single-Tap (Zero script tags, pure Web API)
  useGoogleFedCM();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent"
            >
              🎵 Groovy
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-400">
              <Link
                to="/"
                activeProps={{ className: "text-emerald-400 font-semibold" }}
                className="hover:text-neutral-200 transition-colors"
              >
                Dashboard
              </Link>
              {isAuthenticated && (
                <Link
                  to="/profile"
                  activeProps={{ className: "text-emerald-400 font-semibold" }}
                  className="hover:text-neutral-200 transition-colors"
                >
                  My Profile
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <span className="text-xs text-neutral-500 animate-pulse">
                Verifying session...
              </span>
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="w-8 h-8 rounded-full object-cover border border-neutral-700"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-neutral-200">
                    {user.displayName}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    {user.role}
                  </span>
                </Link>
                <button
                  onClick={() => logout()}
                  className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-sm px-3 py-1.5 rounded text-neutral-300 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="text-sm px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Outlet */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-neutral-900 py-6 text-center text-xs text-neutral-600">
        Groovy Streaming Monolith &bull; Fastify + Bun + PostgreSQL + Redis +
        Cloudflare R2
      </footer>
    </div>
  );
}
