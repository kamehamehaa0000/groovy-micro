import React from "react";
import { Link } from "@tanstack/react-router";
import { ProceduralCover } from "./ProceduralCover";

export interface MediaTileProps {
  to: string;
  params?: Record<string, string>;
  title: string;
  subtitle?: React.ReactNode;
  imageUrl?: string | null;
  artistName?: string | null;
  badge?: React.ReactNode;
  isRoundImage?: boolean;
  className?: string;
  fallbackInitials?: string;
  onClick?: () => void;
}

export function MediaTile({
  to,
  params,
  title,
  subtitle,
  imageUrl,
  artistName,
  badge,
  isRoundImage = false,
  className = "",
  fallbackInitials,
  onClick,
}: MediaTileProps) {
  const roundedClass = isRoundImage ? "rounded-full" : "rounded-md";

  return (
    <div
      className={`group relative flex flex-col p-2.5 rounded-xl hover:bg-canvas-soft/70 active:scale-[0.98] transition-all duration-150 select-none ${className}`}
    >
      <Link
        to={to as any}
        params={params as any}
        onClick={onClick}
        className="flex flex-col w-full text-inherit no-underline"
      >
        {/* Artwork wrapper with aspect square and optional badge indicator */}
        <div
          className={`relative aspect-square w-full mb-2.5 flex items-center justify-center overflow-hidden ${roundedClass}`}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              className={`w-full h-full object-cover shadow-sm shrink-0 bg-panel ${roundedClass}`}
            />
          ) : artistName ? (
            <ProceduralCover
              size="lg"
              title={title}
              artistName={artistName}
              className={`w-full h-full ${roundedClass}`}
            />
          ) : (
            <div
              className={`w-full h-full bg-canvas-soft border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink-soft select-none shrink-0 ${roundedClass}`}
            >
              {fallbackInitials || title.slice(0, 2).toUpperCase()}
            </div>
          )}

          {badge && (
            <div className="absolute top-2 right-2 z-10">
              {badge}
            </div>
          )}
        </div>

        {/* Text information */}
        <div className="w-full">
          <div className="font-semibold text-sm text-ink truncate group-hover:text-blue transition-colors">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-ink-soft truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
