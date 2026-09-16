import React, { useMemo } from "react";

interface ProceduralCoverProps {
  title?: string | null;
  artistName?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const GRADIENT_PALETTES = [
  { from: "#4f46e5", via: "#7c3aed", to: "#db2777" }, // Indigo -> Violet -> Pink
  { from: "#059669", via: "#0d9488", to: "#0284c7" }, // Emerald -> Teal -> Sky
  { from: "#d97706", via: "#ea580c", to: "#dc2626" }, // Amber -> Orange -> Red
  { from: "#7e22ce", via: "#9333ea", to: "#4338ca" }, // Purple -> Indigo
  { from: "#0284c7", via: "#2563eb", to: "#4f46e5" }, // Cyan -> Blue -> Indigo
  { from: "#be185d", via: "#9d174d", to: "#4c0519" }, // Rose -> Wine
  { from: "#0f766e", via: "#115e59", to: "#134e4a" }, // Deep Teal
  { from: "#312e81", via: "#1e1b4b", to: "#0f172a" }, // Midnight Navy
];

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export const ProceduralCover: React.FC<ProceduralCoverProps> = ({
  title = "Untitled",
  artistName = "",
  className = "",
  size = "md",
}) => {
  const seed = `${title}_${artistName}`;
  const hash = useMemo(() => djb2Hash(seed), [seed]);

  const palette = GRADIENT_PALETTES[hash % GRADIENT_PALETTES.length];
  const angle = (hash % 8) * 45;

  const initials = useMemo(() => {
    const cleanTitle = (title || "U").trim();
    const words = cleanTitle.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return cleanTitle.slice(0, 2).toUpperCase();
  }, [title]);

  const patternType = hash % 3; // 0: wave, 1: vinyl circles, 2: modern diagonal grid

  const sizeClasses = {
    sm: "w-10 h-10 text-xs",
    md: "w-16 h-16 text-sm",
    lg: "w-32 h-32 text-xl",
    xl: "w-48 h-48 text-3xl",
  }[size];

  return (
    <div
      className={`relative overflow-hidden rounded-md flex items-center justify-center font-bold tracking-wider select-none shadow-md ${sizeClasses} ${className}`}
      style={{
        background: `linear-gradient(${angle}deg, ${palette.from}, ${palette.via}, ${palette.to})`,
      }}
    >
      {/* Abstract Background SVG Motif */}
      <svg
        className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
      >
        {patternType === 0 && (
          // Wave lines
          <path
            d="M0 20 Q 25 5, 50 20 T 100 20 M0 50 Q 25 35, 50 50 T 100 50 M0 80 Q 25 65, 50 80 T 100 80"
            fill="none"
            stroke="white"
            strokeWidth="3"
          />
        )}
        {patternType === 1 && (
          // Concentric vinyl grooves
          <>
            <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="2" />
            <circle cx="50" cy="50" r="28" fill="none" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="16" fill="none" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="5" fill="white" />
          </>
        )}
        {patternType === 2 && (
          // Modern geometric mesh
          <path
            d="M-20 20 L120 -20 M-20 60 L120 20 M-20 100 L120 60 M-20 140 L120 100"
            stroke="white"
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Initials & Subtle Glow */}
      <span className="relative z-10 text-white font-extrabold drop-shadow-md">
        {initials}
      </span>

      {/* Glassmorphic border */}
      <div className="absolute inset-0 rounded-md border border-white/20 pointer-events-none" />
    </div>
  );
};
