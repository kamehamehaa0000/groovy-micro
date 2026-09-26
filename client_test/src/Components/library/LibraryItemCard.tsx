import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import type { UnifiedLibraryItem, LibraryViewMode } from "../../types/library";
import { useLibraryStore } from "../../stores/library.store";
import {
  PinIconSVG,
  HeartIconSVG,
  UploadCloudSVG,
} from "../icons";

interface LibraryItemCardProps {
  item: UnifiedLibraryItem;
  viewMode: LibraryViewMode;
  onShowToast: (message: string) => void;
}

export function LibraryItemCard({
  item,
  viewMode,
  onShowToast,
}: LibraryItemCardProps) {
  const togglePin = useLibraryStore((s) => s.togglePin);

  // Swipe-right state for list view
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDirectionRef = useRef<"horizontal" | "vertical" | null>(null);
  const didTriggerSwipeRef = useRef(false);

  const handlePinToggle = async () => {
    let apiType: "LIKED_SONGS" | "PERSONAL_COLLECTION" | "PLAYLIST" | "ALBUM" | "ARTIST";
    if (item.kind === "liked_songs") apiType = "LIKED_SONGS";
    else if (item.kind === "personal_collection") apiType = "PERSONAL_COLLECTION";
    else if (item.kind === "playlist") apiType = "PLAYLIST";
    else if (item.kind === "album") apiType = "ALBUM";
    else apiType = "ARTIST";

    const res = await togglePin(apiType, item.itemId);
    if (!res.success && res.message) {
      onShowToast(res.message);
    } else {
      onShowToast(
        res.isPinned
          ? `Pinned "${item.title}" to top`
          : `Unpinned "${item.title}"`
      );
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    touchDirectionRef.current = null;
    didTriggerSwipeRef.current = false;
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    const deltaX = clientX - touchStartRef.current.x;
    const deltaY = clientY - touchStartRef.current.y;

    if (!touchDirectionRef.current) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        touchDirectionRef.current = "vertical";
        return;
      }
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        touchDirectionRef.current = "horizontal";
        setIsSwiping(true);
      }
    }

    if (touchDirectionRef.current === "horizontal") {
      // Left swipe does NOTHING - clamp to 0
      if (deltaX <= 0) {
        setSwipeOffset(0);
        return;
      }

      if (e.cancelable) e.preventDefault();

      // Elastic damping for right swipe
      const maxDrag = 110;
      const damped = Math.min(deltaX * 0.75, maxDrag);
      setSwipeOffset(damped);
    }
  };

  const handleTouchEnd = () => {
    if (touchDirectionRef.current === "horizontal") {
      const threshold = 60;
      if (swipeOffset >= threshold) {
        didTriggerSwipeRef.current = true;
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15);
        }
        handlePinToggle();
      }
    }

    touchStartRef.current = null;
    touchDirectionRef.current = null;
    setSwipeOffset(0);
    setIsSwiping(false);

    if (didTriggerSwipeRef.current) {
      setTimeout(() => {
        didTriggerSwipeRef.current = false;
      }, 150);
    }
  };

  const handleRowClick = (e: React.MouseEvent) => {
    if (didTriggerSwipeRef.current || isSwiping || swipeOffset > 5) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Render Cover Art
  const renderArtwork = (sizeClasses: string) => {
    if (item.kind === "liked_songs") {
      return (
        <div
          className={`${sizeClasses} bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-400 flex items-center justify-center shadow-md select-none shrink-0 ${
            item.isRoundImage ? "rounded-full" : "rounded-md"
          }`}
        >
          <div className="text-white scale-110">
            <HeartIconSVG filled={true} className="w-5 h-5" />
          </div>
        </div>
      );
    }

    if (item.kind === "personal_collection") {
      return (
        <div
          className={`${sizeClasses} bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-500 flex items-center justify-center shadow-md select-none shrink-0 ${
            item.isRoundImage ? "rounded-full" : "rounded-md"
          }`}
        >
          <div className="text-white scale-110">
            <UploadCloudSVG className="w-5 h-5" />
          </div>
        </div>
      );
    }

    if (item.imageUrl) {
      return (
        <img
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          className={`${sizeClasses} object-cover shadow-sm shrink-0 bg-panel ${
            item.isRoundImage ? "rounded-full" : "rounded-md"
          }`}
        />
      );
    }

    // Fallback initials placeholder
    return (
      <div
        className={`${sizeClasses} bg-canvas-soft border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink-soft select-none shrink-0 ${
          item.isRoundImage ? "rounded-full" : "rounded-md"
        }`}
      >
        {item.title.slice(0, 2).toUpperCase()}
      </div>
    );
  };

  // 1. LIST VIEW (Swipe-right to Pin/Unpin, no three dots)
  if (viewMode === "list") {
    const isPastThreshold = swipeOffset >= 60;

    return (
      <div
        className="relative overflow-hidden rounded-xl select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Underneath Action Tray revealed on swipe right */}
        <div
          className={`absolute inset-0 flex items-center justify-start pl-4 rounded-xl select-none transition-colors ${
            isPastThreshold
              ? "bg-emerald-500/25 dark:bg-emerald-500/35"
              : "bg-emerald-500/15 dark:bg-emerald-500/20"
          }`}
          style={{
            opacity: Math.min(swipeOffset / 30, 1),
          }}
        >
          <div
            className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs transition-transform"
            style={{
              transform: `scale(${Math.min(0.85 + (swipeOffset / 60) * 0.25, 1.15)})`,
            }}
          >
            <PinIconSVG className="w-4 h-4 text-emerald-500" />
            <span>{item.isPinned ? "Unpin" : "Pin to top"}</span>
          </div>
        </div>

        {/* Sliding Foreground Row */}
        <div
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwiping
              ? "none"
              : "transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)",
          }}
          className="relative z-10 bg-canvas flex items-center justify-between p-2 rounded-xl hover:bg-canvas-soft/80 active:scale-[0.99] transition-colors"
        >
          <Link
            to={item.linkTo}
            onClick={handleRowClick}
            className="flex items-center gap-3.5 flex-1 min-w-0"
          >
            {renderArtwork("w-14 h-14 min-w-[56px]")}

            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-ink truncate block">
                  {item.title}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-ink-soft mt-0.5 truncate">
                {item.isPinned && (
                  <span
                    title="Pinned to top"
                    className="text-emerald-500 dark:text-emerald-400 shrink-0 inline-flex items-center"
                  >
                    <PinIconSVG className="w-3.5 h-3.5" />
                  </span>
                )}
                <span className="truncate">{item.subtitle}</span>
              </div>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  // 2. GRID / TILED VIEW (No pin/unpin/share options, pure clean card)
  return (
    <div className="group relative flex flex-col p-2.5 rounded-xl hover:bg-canvas-soft/70 active:scale-[0.98] transition-all duration-150 select-none">
      <Link to={item.linkTo} className="flex flex-col w-full">
        {/* Artwork wrapper with aspect square and pin badge indicator if already pinned */}
        <div className="relative aspect-square w-full mb-2.5 flex items-center justify-center">
          {renderArtwork("w-full h-full")}

          {item.isPinned && (
            <div
              title="Pinned to top"
              className="absolute top-2 right-2 bg-panel/90 backdrop-blur-md text-emerald-500 dark:text-emerald-400 p-1 rounded-full shadow-md border border-line/40"
            >
              <PinIconSVG className="w-3 h-3" />
            </div>
          )}
        </div>

        {/* Text information */}
        <div className="w-full">
          <div className="font-semibold text-sm text-ink truncate">
            {item.title}
          </div>
          <div className="text-xs text-ink-soft truncate mt-0.5">
            {item.subtitle}
          </div>
        </div>
      </Link>
    </div>
  );
}
