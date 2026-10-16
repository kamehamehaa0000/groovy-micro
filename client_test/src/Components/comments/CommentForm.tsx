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
        <div className="flex items-center justify-between text-caption font-mono text-muted-foreground">
          <span>
            Replying to <span className="text-primary font-medium">@{replyToUserName}</span>
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="hover:text-foreground cursor-pointer underline text-eyebrow"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="relative rounded-md border border-border bg-card focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={replyToUserName || onCancel ? 2 : 3}
          maxLength={2000}
          className="w-full bg-transparent p-3 text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none resize-y min-h-[60px]"
        />

        <div className="flex items-center justify-between px-3 py-2 border-t border-border-soft bg-background/40">
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-eyebrow ${
                isOverLimit
                  ? "text-destructive font-semibold"
                  : charCount > 1800
                  ? "text-warning"
                  : "text-muted-foreground/60"
              }`}
            >
              {charCount} / 2000
            </span>
            {errorMsg && (
              <span className="text-caption text-destructive line-clamp-1">{errorMsg}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-3 py-1 text-caption font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isEmpty || isOverLimit || isSubmitting}
              className={`px-3.5 py-1 text-caption font-mono rounded-control font-medium cursor-pointer transition-all ${
                isEmpty || isOverLimit || isSubmitting
                  ? "bg-secondary/40 text-muted-foreground/50 cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-foreground/80 active:scale-95"
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
