import React, { useState } from "react";

interface CommentFormProps {
  initialContent?: string;
  placeholder?: string;
  replyToUserName?: string | null;
  submitLabel?: string;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function CommentForm({
  initialContent = "",
  placeholder = "Add a comment...",
  replyToUserName,
  submitLabel = "Comment",
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentFormProps) {
  const [content, setContent] = useState(initialContent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmit(trimmed);
      setContent("");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const charCount = content.length;
  const isOverLimit = charCount > 2000;
  const isEmpty = content.trim().length === 0;

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2">
      {replyToUserName && (
        <div className="flex items-center justify-between text-xs font-mono text-ink-soft">
          <span>
            Replying to <span className="text-blue font-medium">@{replyToUserName}</span>
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="hover:text-ink cursor-pointer underline text-[11px]"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="relative rounded-md border border-line bg-panel focus-within:border-blue focus-within:ring-1 focus-within:ring-blue/30 transition-all">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={replyToUserName || onCancel ? 2 : 3}
          maxLength={2000}
          className="w-full bg-transparent p-3 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none resize-y min-h-[60px]"
        />

        <div className="flex items-center justify-between px-3 py-2 border-t border-line-soft bg-canvas/40">
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-[10.5px] ${
                isOverLimit
                  ? "text-red-500 font-semibold"
                  : charCount > 1800
                  ? "text-amber-500"
                  : "text-ink-soft/60"
              }`}
            >
              {charCount} / 2000
            </span>
            {errorMsg && (
              <span className="text-xs text-red-500 line-clamp-1">{errorMsg}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-3 py-1 text-xs font-mono text-ink-soft hover:text-ink cursor-pointer transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isEmpty || isOverLimit || isSubmitting}
              className={`px-3.5 py-1 text-xs font-mono rounded font-medium cursor-pointer transition-all ${
                isEmpty || isOverLimit || isSubmitting
                  ? "bg-stone/40 text-ink-soft/50 cursor-not-allowed"
                  : "bg-ink text-canvas hover:bg-ink/80 active:scale-95"
              }`}
            >
              {isSubmitting ? "Posting..." : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
