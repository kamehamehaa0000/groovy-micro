import React, { useState } from 'react'

interface PlaylistCoverProps {
  coverImageUrl?: string | null
  mosaicCovers?: string[]
  title: string
  className?: string
}

export const PlaylistCover: React.FC<PlaylistCoverProps> = ({
  coverImageUrl,
  mosaicCovers,
  title,
  className = 'w-full h-full',
}) => {
  const [imageError, setImageError] = useState(false)

  // 1. Explicit curator-uploaded cover artwork
  if (coverImageUrl && !imageError) {
    return (
      <img
        src={coverImageUrl}
        alt={title}
        className={`w-full h-full object-cover ${className}`}
        loading="lazy"
        onError={() => setImageError(true)}
      />
    )
  }

  // 2. Client-side dynamic 2x2 CSS grid mosaic cover
  if (mosaicCovers && mosaicCovers.length >= 4) {
    return (
      <div
        className={`w-full h-full grid grid-cols-2 grid-rows-2 overflow-hidden bg-muted ${className}`}
      >
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
    )
  }

  // 3. 1 to 3 distinct song artworks -> use primary cover
  if (mosaicCovers && mosaicCovers.length > 0) {
    return (
      <img
        src={mosaicCovers[0]}
        alt={title}
        className={`w-full h-full object-cover ${className}`}
        loading="lazy"
      />
    )
  }

  // 4. Fallback placeholder (Vinyl record / playlist groove icon)
  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-muted border border-border ${className}`}
    >
      <svg
        className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground/50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10.5" />
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    </div>
  )
}
