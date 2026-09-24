import React, { useRef, useState, useEffect } from 'react'

interface MarqueeTextProps {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  speed?: number // pixels per second (default 26)
  pauseMs?: number // pause at start and end in ms (default 1600)
  hoverOnly?: boolean
}

export function MarqueeText({
  children,
  className = '',
  innerClassName = '',
  speed = 26,
  pauseMs = 1600,
  hoverOnly = false,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [overflowDistance, setOverflowDistance] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  const checkOverflow = () => {
    if (!containerRef.current || !contentRef.current) return
    const containerWidth = containerRef.current.clientWidth
    const contentWidth = contentRef.current.scrollWidth
    if (contentWidth > containerWidth + 2) {
      setIsOverflowing(true)
      setOverflowDistance(contentWidth - containerWidth + 12)
    } else {
      setIsOverflowing(false)
      setOverflowDistance(0)
    }
  }

  useEffect(() => {
    checkOverflow()
    if (!containerRef.current) return

    const ro = new ResizeObserver(() => {
      checkOverflow()
    })
    ro.observe(containerRef.current)
    if (contentRef.current) {
      ro.observe(contentRef.current)
    }

    return () => ro.disconnect()
  }, [children])

  // Dynamic animation timing calculation
  const travelSec = Math.max(2, overflowDistance / speed)
  const pauseSec = pauseMs / 1000
  const totalCycleSec = travelSec * 2 + pauseSec * 2
  const shouldAnimate = isOverflowing && (!hoverOnly || isHovered)

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`overflow-hidden relative whitespace-nowrap min-w-0 ${className}`}
      style={
        isOverflowing
          ? {
              maskImage:
                'linear-gradient(to right, black calc(100% - 14px), transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, black calc(100% - 14px), transparent 100%)',
            }
          : undefined
      }
    >
      <style>{`
        @keyframes marquee-pingpong {
          0%, 18% { transform: translateX(0); }
          68%, 86% { transform: translateX(var(--marquee-distance, -50px)); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <div
        ref={contentRef}
        className={`inline-block whitespace-nowrap ${innerClassName}`}
        style={
          shouldAnimate
            ? {
                animation: `marquee-pingpong ${totalCycleSec}s ease-in-out infinite`,
                animationDelay: '0.8s',
                ['--marquee-distance' as any]: `-${overflowDistance}px`,
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  )
}
