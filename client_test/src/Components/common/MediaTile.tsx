import React from "react";
import { Link } from "@tanstack/react-router";
import { ProceduralCover } from "./ProceduralCover";

export interface MediaTileProps {
  to?: string;
  params?: Record<string, string>;
  title: string;
  subtitle?: React.ReactNode;
  imageUrl?: string | null;
  customCover?: React.ReactNode;
  artistName?: string | null;
  badge?: React.ReactNode;
  isRoundImage?: boolean;
  className?: string;
  fallbackInitials?: string;
  onClick?: () => void;
  onPlay?: () => void;
}

export function MediaTile({
  to,
  params,
  title,
  subtitle,
  imageUrl,
  customCover,
  artistName,
  badge,
  isRoundImage = false,
  className = "",
  fallbackInitials,
  onClick,
  onPlay,
}: MediaTileProps) {
  const roundedClass = isRoundImage ? "rounded-full" : "rounded-md";

  const content = (
    <>

        {/* Artwork wrapper with aspect square and optional badge indicator */}
        <div
          className={`relative aspect-square w-full mb-2.5 overflow-hidden ${roundedClass} bg-canvas-deep`}
        >
          {customCover ? (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center">
              {customCover}
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              className={`absolute inset-0 w-full h-full object-cover shadow-xs ${roundedClass}`}
            />
          ) : artistName ? (
            <div className="absolute inset-0 w-full h-full">
              <ProceduralCover
                size="lg"
                title={title}
                artistName={artistName}
                className={`w-full h-full ${roundedClass}`}
              />
            </div>
          ) : (
            <div
              className={`absolute inset-0 w-full h-full border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink-soft select-none ${roundedClass}`}
            >
              {fallbackInitials || title.slice(0, 2).toUpperCase()}
            </div>
          )}

          {badge && (
            <div className="absolute top-2 right-2 z-10">
              {badge}
            </div>
          )}

          {onPlay && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPlay();
              }}
              className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center opacity-100 translate-y-0 sm:opacity-0 sm:translate-y-1 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 transition-all duration-200 hover:scale-105 active:scale-95 z-20 cursor-pointer"
              aria-label="Play"
            >
              <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
        </div>


        {/* Text information */}
        <div className="w-full">
          <div className="font-semibold text-sm text-ink truncate group-hover:text-primary transition-colors">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-ink-soft truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </>
    );

    return (
      <div
        className={`group relative flex flex-col p-2.5 rounded-xl hover:bg-stone/30 active:scale-[0.98] transition-all duration-150 select-none ${className}`}
      >
        {to ? (
          <Link
            to={to as any}
            params={params as any}
            onClick={onClick}
            className="flex flex-col w-full text-inherit no-underline"
          >
            {content}
          </Link>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={onClick || onPlay}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (onClick || onPlay)?.();
              }
            }}
            className="flex flex-col w-full text-inherit no-underline cursor-pointer"
          >
            {content}
          </div>
        )}
      </div>
    );
  }

