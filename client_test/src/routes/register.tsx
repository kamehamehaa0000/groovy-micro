import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/auth.store";

export const Route = createFileRoute("/register")({
  component: RegisterComponent,
});

function RegisterComponent() {
  const { register, resendVerification } = useAuthStore();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verification prompt state
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await register(email, password, displayName);
      setRegisteredEmail(result.email);
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail || cooldown > 0) return;
    setResendNotice(null);
    setIsResending(true);

    try {
      const res = await resendVerification(registeredEmail);
      setResendNotice({
        text: res.message || "Verification email sent! Check your inbox.",
        type: "success",
      });
      setCooldown(60);
    } catch (err: any) {
      setResendNotice({
        text: err.message || "Failed to resend verification email.",
        type: "error",
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto my-4 border border-line bg-canvas shadow-xs grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] min-h-[640px] overflow-hidden">
      {/* ===================== BRAND PANEL ===================== */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-canvas-deep border-r border-line relative overflow-hidden select-none">
        <div className="font-serif italic text-2xl text-ink">
          Groov<span className="not-italic text-blue font-serif">y</span>
        </div>

        <div className="max-w-md my-auto relative z-10">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-blue-deep mb-4">
            Maison Édition — Sound Atelier
          </div>
          <h1 className="font-serif italic text-4xl text-ink leading-[1.1] mb-4 font-normal">
            A quiet space in the catalog.
          </h1>
          <p className="font-sans text-sm leading-[1.7] text-ink-soft max-w-sm">
            Join the collective to access our full fidelity catalog, preserved
            performances, and dedicated personal archives.
          </p>
        </div>

        {/* Decorative Geometric Vinyl Record SVG Art */}
        <div className="pointer-events-none absolute -right-16 -bottom-16 w-80 h-80 opacity-70">
          <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none">
            <g stroke="currentColor" className="text-stone dark:text-stone/40" strokeWidth="0.5">
              {[8, 15, 22, 29, 36, 43, 50].map((r) => (
                <circle key={r} cx="50" cy="50" r={r} />
              ))}
            </g>
            <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" className="text-stone dark:text-stone/40" strokeWidth="0.35" opacity="0.4" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="currentColor" className="text-stone dark:text-stone/40" strokeWidth="0.35" opacity="0.4" />
          </svg>
        </div>

        <div className="flex justify-between items-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft relative z-10">
          <span>Members Only</span>
          <span>Est. MMXXVI</span>
        </div>
      </div>

      {/* ===================== FORM PANEL ===================== */}
      <div className="flex items-center justify-center p-8 sm:p-14">
        <div className="w-full max-w-[360px]">
          {registeredEmail ? (
            /* Check Your Inbox View */
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => setRegisteredEmail(null)}
                className="self-start font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft hover:text-ink transition-colors mb-6 cursor-pointer"
              >
                &larr; Back to form
              </button>

              <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep mb-2">
                Correspondence · Account
              </div>
              <h2 className="font-serif italic font-medium text-3xl text-ink mb-3 leading-tight">
                Check your inbox
              </h2>
              <p className="text-xs text-ink-soft leading-relaxed mb-6">
                We've dispatched a verification link to{" "}
                <strong className="text-ink font-mono text-[11px] block mt-1.5 p-2 bg-canvas-deep border border-line">
                  {registeredEmail}
                </strong>
              </p>
              <p className="text-xs text-ink-soft leading-relaxed mb-6">
                Please follow the correspondence link in your message to
                activate your membership before entering the Maison.
              </p>

              {resendNotice && (
                <div
                  className={`mb-6 p-3 border text-xs ${
                    resendNotice.type === "success"
                      ? "border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400"
                      : "border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400"
                  }`}
                >
                  {resendNotice.text}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-4 border-t border-line">
                <Link
                  to="/login"
                  className="w-full text-center bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink"
                >
                  Go to Sign In &rarr;
                </Link>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending || cooldown > 0}
                  className="w-full border border-line bg-panel hover:bg-canvas-deep py-2.5 px-4 font-mono text-[10px] uppercase tracking-[0.1em] text-ink transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {cooldown > 0
                    ? `Resend available in ${cooldown}s`
                    : isResending
                    ? "Dispatching..."
                    : "Resend Verification Link"}
                </button>
              </div>

              <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-ink-soft text-center mt-6">
                Wrong address?{" "}
                <button
                  type="button"
                  onClick={() => setRegisteredEmail(null)}
                  className="text-blue underline cursor-pointer"
                >
                  Edit and resend
                </button>
              </div>
            </div>
          ) : (
            /* Register Form View */
            <div className="flex flex-col">
              {/* Navigation Tabs */}
              <div className="flex gap-7 mb-8 border-b border-line">
                <Link
                  to="/login"
                  className="font-mono text-xs uppercase tracking-[0.08em] pb-3 border-b-2 border-transparent text-ink-soft hover:text-ink transition-colors"
                >
                  Sign In
                </Link>
                <span className="font-mono text-xs uppercase tracking-[0.08em] pb-3 border-b-2 border-blue text-ink font-medium">
                  Create Account
                </span>
              </div>

              <h2 className="font-serif italic font-medium text-2xl text-ink mb-1.5">
                Join the Maison
              </h2>
              <p className="text-xs text-ink-soft leading-relaxed mb-7">
                A quiet, curated corner of the catalog — reserved once you're in.
              </p>

              {/* Error Notice */}
              {error && (
                <div className="mb-6 p-3.5 border border-red-800/30 bg-red-900/10 text-xs text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Google OAuth Button */}
              <a
                href="/api/v1/auth/google"
                className="w-full flex items-center justify-center gap-2.5 border border-line bg-panel hover:bg-canvas-deep text-ink text-xs font-medium py-3 px-4 transition-all mb-6 cursor-pointer shadow-2xs"
              >
                <svg height="16" viewBox="0 0 18 18" width="16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" fill="#34A853" />
                  <path d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" fill="#FBBC05" />
                  <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" fill="#EA4335" />
                </svg>
                Continue with Google
              </a>

              {/* Divider */}
              <div className="flex items-center gap-3.5 mb-6 before:content-[''] before:flex-1 before:h-px before:bg-line after:content-[''] after:flex-1 after:h-px after:bg-line">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                  Or with credentials
                </span>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="su-name"
                    className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-soft"
                  >
                    Display Name
                  </label>
                  <input
                    id="su-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How should we address you"
                    className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="su-email"
                    className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-soft"
                  >
                    Email Address
                  </label>
                  <input
                    id="su-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="su-password"
                    className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-soft"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="su-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 pr-12 focus:border-ink placeholder:text-stone transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-soft hover:text-ink cursor-pointer"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="text-[10.5px] text-ink-soft mt-1">
                    Require 1 uppercase, 1 lowercase, 1 number, min 8 chars.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Creating..." : "Create Account"}
                </button>
              </form>

              <div className="font-sans text-xs text-ink-soft text-center mt-7">
                Already a member?{" "}
                <Link
                  to="/login"
                  className="text-blue hover:underline transition-colors"
                >
                  Sign in
                </Link>
              </div>

              <p className="font-sans text-[11px] text-ink-soft/80 text-center mt-5 leading-relaxed">
                By creating an account, you agree to the Maison terms of access and privacy charter.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

