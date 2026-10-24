import type { SVGProps } from 'react'

type LikedSongsCoverProps = SVGProps<SVGSVGElement> & {
  accentColor?: string
}

export function LikedSongsCover({
  accentColor = '#C8F36A',
  className = '',
  ...props
}: LikedSongsCoverProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Liked Songs playlist cover"
      className={`block h-full w-full ${className}`}
      {...props}
    >
      {/* Background */}
      <rect width="400" height="400" fill="#151515" />

      {/* Sound waves */}
      <g fill="none" stroke={accentColor} strokeWidth="3.2">
        <path d="M24 158 Q69 50 114 158 T204 158 T294 158 T384 158" />
        <path d="M24 177 Q69 69 114 177 T204 177 T294 177 T384 177" />
        <path d="M24 196 Q69 88 114 196 T204 196 T294 196 T384 196" />
        <path d="M24 215 Q69 107 114 215 T204 215 T294 215 T384 215" />
      </g>

      {/* Heart */}
      <path
        d="M200 91 C182 61 145 66 145 92 C145 113 177 137 200 155 C223 137 255 113 255 92 C255 66 218 61 200 91Z"
        fill={accentColor}
      />

      {/* Typography */}
      <g
        fill="#F5F3EC"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="51"
        fontWeight="900"
        letterSpacing="-2.8"
      >
        <text x="25" y="286">
          LIKED
        </text>
        <text x="25" y="337">
          SONGS.
        </text>
      </g>
    </svg>
  )
}
