import React from "react";

interface PlaylistCoverProps {
  coverImageUrl?: string | null;
  mosaicCovers?: string[];
  title: string;
  className?: string;
}

export const PlaylistCover: React.FC<PlaylistCoverProps> = ({
  coverImageUrl,
  mosaicCovers,
  title,
  className = "w-full h-full",
}) => {
  // 1. Explicit curator-uploaded cover artwork
  if (coverImageUrl) {
    return (
      <img
        src={coverImageUrl}
        alt={title}
        className={`object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  // 2. Client-side dynamic 2x2 CSS grid mosaic cover
  if (mosaicCovers && mosaicCovers.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-stone/20 ${className}`}>
        {mosaicCovers.slice(0, 4).map((imgUrl, index) => (
          <img
            key={index}
            src={imgUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ))}
      </div>
    );
  }

  // 3. 1 to 3 distinct song artworks -> use primary cover
  if (mosaicCovers && mosaicCovers.length > 0) {
    return (
      <img
        src={mosaicCovers[0]}
        alt={title}
        className={`object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  // 4. Fallback placeholder (Vinyl record / playlist groove icon)
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-stone/30 via-canvas to-stone/20 border border-line ${className}`}
    >
      <svg
        className="w-1/3 h-1/3 text-ink-soft/40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  );
};
