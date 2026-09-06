import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuthStore } from "../stores/auth.store";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">
          Groovy Streaming &bull; Auth & Storage Testbed
        </h1>
        <p className="text-neutral-400 max-w-2xl text-sm leading-relaxed">
          This lightweight frontend tests all the core backend capabilities:
          Argon2id password hashing, Refresh Token Rotation (RTR), theft reuse
          detection, session revocation, and direct-to-R2 pre-signed uploads.
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          {!isAuthenticated && !isLoading ? (
            <>
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
              >
                Log In to Account
              </Link>
              <Link
                to="/register"
                className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-sm transition-colors border border-neutral-700"
              >
                Create New Account
              </Link>
            </>
          ) : (
            <Link
              to="/profile"
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
            >
              Go to Profile & Settings &rarr;
            </Link>
          )}
        </div>
      </section>

      {/* Auth Status & Subscription Information */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-neutral-200 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Session State
          </h2>

          {isLoading ? (
            <p className="text-sm text-neutral-500">Checking auth state...</p>
          ) : isAuthenticated && user ? (
            <div className="space-y-2 text-sm text-neutral-300">
              <div className="flex justify-between py-1 border-b border-neutral-800">
                <span className="text-neutral-500">User ID:</span>
                <span className="font-mono text-xs text-neutral-400 truncate max-w-[200px]">
                  {user.id}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-800">
                <span className="text-neutral-500">Email:</span>
                <span>{user.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-800">
                <span className="text-neutral-500">Display Name:</span>
                <span className="font-semibold text-white">
                  {user.displayName}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-800">
                <span className="text-neutral-500">Role:</span>
                <span className="text-emerald-400 font-medium">{user.role}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">Email Verified:</span>
                <span>{user.isEmailVerified ? "✅ Yes" : "❌ No"}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No active session. Please log in or register.
            </div>
          )}
        </div>

        {/* Subscription Features Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-neutral-200 mb-4">
            Subscription & Entitlements
          </h2>

          {isAuthenticated && user?.plan ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  Active Tier:
                </span>
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded bg-teal-950 text-teal-400 border border-teal-800">
                  {user.plan.name}
                </span>
              </div>

              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                <p className="text-xs text-neutral-400 font-semibold mb-2">
                  Plan Entitlements (JSON Features):
                </p>
                <pre className="text-xs text-emerald-400 overflow-x-auto font-mono">
                  {JSON.stringify(user.plan.features, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 py-4 text-center">
              Sign in to view subscription entitlements.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
