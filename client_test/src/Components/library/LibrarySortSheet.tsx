import { useEffect } from "react";
import type { LibrarySortType } from "../../types/library";

interface LibrarySortSheetProps {
  isOpen: boolean;
  activeSort: LibrarySortType;
  onSelectSort: (sort: LibrarySortType) => void;
  onClose: () => void;
}

export function LibrarySortSheet({
  isOpen,
  activeSort,
  onSelectSort,
  onClose,
}: LibrarySortSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sortOptions: Array<{ key: LibrarySortType; label: string }> = [
    { key: "recent", label: "Recently added" },
    { key: "alphabetical", label: "Alphabetical (A-Z)" },
    { key: "creator", label: "Creator / Artist" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div className="relative w-full sm:max-w-xs max-h-[80vh] overflow-y-auto bg-card border-t sm:border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl p-4 sm:p-5 pb-safe z-10 transition-transform select-none">
        {/* Mobile handle */}
        <div className="sm:hidden w-10 h-1 bg-border rounded-full mx-auto mb-3" />

        <div className="text-caption font-eyebrow uppercase tracking-wider text-muted-foreground mb-3 px-1">
          Sort by
        </div>

        <div className="flex flex-col gap-1">
          {sortOptions.map((opt) => {
            const isSelected = activeSort === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onSelectSort(opt.key);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-body transition-colors text-left ${
                  isSelected
                    ? "text-foreground font-semibold bg-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <svg
                    className="w-4 h-4 text-success"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
