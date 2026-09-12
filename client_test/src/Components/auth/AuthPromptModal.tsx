import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthModalStore, type AuthModalOptions } from "../../stores/auth-modal.store";

interface AuthPromptModalProps extends AuthModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AuthPromptModal(props: AuthPromptModalProps) {
  const navigate = useNavigate();
  const storeIsOpen = useAuthModalStore((s) => s.isOpen);
  const storeOptions = useAuthModalStore((s) => s.options);
  const closeStoreModal = useAuthModalStore((s) => s.closeAuthModal);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const handleClose = props.onClose || closeStoreModal;

  const activeSubtitle = props.subtitle || storeOptions.subtitle || "Account";
  const activeCategory = props.category || storeOptions.category || "Member Access";
  const activeTitle =
    props.title ||
    storeOptions.title || (
      <>
        Continue
        <br />
        with Groovy.
      </>
    );
  const activeDescription =
    props.description ||
    storeOptions.description ||
    "Sign in or create an account to continue listening, save music, and make Groovy yours.";

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-5 sm:p-8"
    >
      {/* Backdrop overlay (dismiss on click without interrupting background audio) */}
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-in fade-in duration-150 cursor-pointer"
        onClick={handleClose}
      />

      {/* Dialog card styled to match Groovy Sound Atelier reference design */}
      <section
        className="relative w-full max-w-[460px] border border-line bg-canvas shadow-[0_24px_80px_rgba(23,22,15,0.20)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-150 overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top rule / close */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 sm:px-8">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
            Groovy / {activeSubtitle}
          </span>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="group flex h-7 w-7 items-center justify-center text-ink-soft transition hover:text-ink cursor-pointer"
          >
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-9 sm:px-10 sm:py-11">
          {/* Brand */}
          <div className="mb-8">
            <div className="font-serif text-[29px] italic leading-none tracking-[-0.04em] text-ink">
              Groovy
            </div>
            <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.26em] text-ink-soft">
              Sound Atelier
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <div className="mb-4 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.2em] text-blue">
              <span className="h-px w-7 bg-blue"></span>
              {activeCategory}
            </div>

            <h1
              id="auth-dialog-title"
              className="font-serif text-[39px] font-normal leading-[0.98] tracking-[-0.035em] sm:text-[43px] text-ink"
            >
              {activeTitle}
            </h1>

            <p className="mt-5 max-w-[350px] text-[13px] leading-6 text-ink-soft">
              {activeDescription}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                handleClose();
                navigate({ to: "/login" });
              }}
              className="group flex w-full items-center justify-between border border-ink bg-ink px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-canvas transition hover:bg-blue hover:border-blue cursor-pointer shadow-xs"
            >
              <span>Log in</span>
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M2 8H13M9 4L13 8L9 12"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => {
                handleClose();
                navigate({ to: "/register" });
              }}
              className="group flex w-full items-center justify-between border border-line bg-transparent px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink transition hover:border-blue hover:text-blue cursor-pointer"
            >
              <span>Create account</span>
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M2 8H13M9 4L13 8L9 12"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </button>
          </div>

          {/* Fine print */}
          <div className="mt-7 border-t border-line pt-5">
            <p className="font-mono text-[8px] uppercase leading-5 tracking-[0.12em] text-ink-soft">
              Free to join · High-fidelity streaming · Your library, everywhere
            </p>
          </div>
        </div>

        {/* Bottom metadata */}
        <div className="border-t border-line px-6 py-4 sm:px-8">
          <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.16em] text-ink-soft">
            <span>Authentication</span>
            <span>Groovy Music</span>
          </div>
        </div>
      </section>
    </div>
  );
}
