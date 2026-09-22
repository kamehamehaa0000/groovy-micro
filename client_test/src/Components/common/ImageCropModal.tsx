import { useState, useRef, useEffect, useCallback } from 'react'

interface ImageCropModalProps {
  isOpen: boolean
  onClose: () => void
  imageFile: File | null
  title?: string
  subtitle?: string
  aspectRatio: number // width / height, e.g. 3 for 3:1 banner, 1 for 1:1 avatar
  isCircularMask?: boolean
  targetMaxWidth?: number
  targetMaxHeight?: number
  isSubmitting?: boolean
  onCropComplete: (croppedFile: File) => Promise<void> | void
}

export function ImageCropModal({
  isOpen,
  onClose,
  imageFile,
  title = 'Adjust Artwork Framing',
  subtitle = 'Artwork Framing & Crop Studio',
  aspectRatio,
  isCircularMask = false,
  targetMaxWidth = 1800,
  targetMaxHeight = 600,
  isSubmitting = false,
  onCropComplete,
}: ImageCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState<number>(1)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [cropError, setCropError] = useState<string | null>(null)

  // Dynamic responsiveness: measure the container wrapper width & window height
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [wrapperWidth, setWrapperWidth] = useState<number>(360)
  const [viewportHeight, setViewportHeight] = useState<number>(
    typeof window !== 'undefined' ? window.innerHeight : 600,
  )

  const imageRef = useRef<HTMLImageElement | null>(null)
  const cropBoxRef = useRef<HTMLDivElement | null>(null)

  // Track pointers for multi-touch pinch-to-zoom and drag
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const pinchStartDistRef = useRef<number | null>(null)
  const pinchStartZoomRef = useRef<number>(1)

  // Measure wrapper width dynamically
  useEffect(() => {
    if (!isOpen) return

    const updateDimensions = () => {
      if (wrapperRef.current) {
        const measured = Math.floor(wrapperRef.current.clientWidth)
        if (measured > 0) setWrapperWidth(measured)
      }
      setViewportHeight(window.innerHeight)
    }

    updateDimensions()
    const timer = setTimeout(updateDimensions, 50)

    let ro: ResizeObserver | null = null
    if (wrapperRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateDimensions())
      ro.observe(wrapperRef.current)
    }

    window.addEventListener('resize', updateDimensions)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateDimensions)
      ro?.disconnect()
    }
  }, [isOpen])

  // Responsive crop box dimensions
  // Max width constrained to wrapper width (with 4px margin) up to 520px desktop
  const maxAllowedWidth = Math.max(120, Math.min(wrapperWidth, 520))
  // Constrain height on smaller screens so controls and buttons always remain visible
  const maxAllowedHeight = Math.max(
    100,
    Math.min(Math.floor(viewportHeight * (aspectRatio === 1 ? 0.38 : 0.32)), 320),
  )

  let boxWidth = maxAllowedWidth
  let boxHeight = boxWidth / aspectRatio

  if (boxHeight > maxAllowedHeight) {
    boxHeight = maxAllowedHeight
    boxWidth = boxHeight * aspectRatio
  }

  boxWidth = Math.floor(boxWidth)
  boxHeight = Math.floor(boxHeight)

  // Load image object URL
  useEffect(() => {
    if (!imageFile) {
      setImageSrc(null)
      setImageSize(null)
      return
    }

    const objectUrl = URL.createObjectURL(imageFile)
    setImageSrc(objectUrl)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setCropError(null)

    const img = new Image()
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = objectUrl

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [imageFile])

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  // Calculate current scale & boundary clamp
  const getScaleAndBounds = useCallback(() => {
    if (!imageSize || boxWidth <= 0 || boxHeight <= 0) {
      return { scale: 1, maxOffsetX: 0, maxOffsetY: 0, displayWidth: boxWidth, displayHeight: boxHeight }
    }

    const minScale = Math.max(boxWidth / imageSize.width, boxHeight / imageSize.height)
    const scale = minScale * zoom

    const displayWidth = imageSize.width * scale
    const displayHeight = imageSize.height * scale

    const maxOffsetX = Math.max(0, (displayWidth - boxWidth) / 2)
    const maxOffsetY = Math.max(0, (displayHeight - boxHeight) / 2)

    return { scale, maxOffsetX, maxOffsetY, displayWidth, displayHeight }
  }, [imageSize, boxWidth, boxHeight, zoom])

  // Clamp offset when scale or dimensions change
  useEffect(() => {
    const { maxOffsetX, maxOffsetY } = getScaleAndBounds()
    setOffset((prev) => ({
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, prev.x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, prev.y)),
    }))
  }, [zoom, boxWidth, boxHeight, getScaleAndBounds])

  // Pointer Down (Mouse & Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    try {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      // Ignored if capture unsupported
    }

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size === 1) {
      dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
    } else if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      pinchStartDistRef.current = dist
      pinchStartZoomRef.current = zoom
    }
  }

  // Pointer Move (Mouse & Touch)
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Pinch-to-zoom if 2 fingers active
    if (activePointers.current.size === 2 && pinchStartDistRef.current) {
      const pts = Array.from(activePointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const ratio = dist / pinchStartDistRef.current
      const nextZoom = Math.min(3, Math.max(1, pinchStartZoomRef.current * ratio))
      setZoom(Number(nextZoom.toFixed(2)))
      return
    }

    // Single pointer drag
    if (activePointers.current.size === 1) {
      const { maxOffsetX, maxOffsetY } = getScaleAndBounds()
      const rawX = e.clientX - dragStartRef.current.x
      const rawY = e.clientY - dragStartRef.current.y

      const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, rawX))
      const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, rawY))

      setOffset({ x: clampedX, y: clampedY })
    }
  }

  // Pointer Up / Cancel
  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignored
    }

    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size === 0) {
      pinchStartDistRef.current = null
    } else if (activePointers.current.size === 1) {
      // Switched from pinch to single drag
      const remaining = Array.from(activePointers.current.values())[0]
      dragStartRef.current = { x: remaining.x - offset.x, y: remaining.y - offset.y }
      pinchStartDistRef.current = null
    }
  }

  // Wheel Zoom (Desktop)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08
    setZoom((prev) => {
      const nextZoom = Math.min(3, Math.max(1, prev + zoomDelta))
      return Number(nextZoom.toFixed(2))
    })
  }

  // Confirm and generate cropped image File
  const handleConfirmCrop = async () => {
    if (!imageRef.current || !imageSize || !imageFile) return

    setCropError(null)
    const { scale } = getScaleAndBounds()

    try {
      const displayWidth = imageSize.width * scale
      const displayHeight = imageSize.height * scale

      // The position of the crop box relative to displayed image
      const cropLeftInDisplay = (displayWidth - boxWidth) / 2 - offset.x
      const cropTopInDisplay = (displayHeight - boxHeight) / 2 - offset.y

      // In natural image source coordinates
      const sourceX = Math.max(0, cropLeftInDisplay / scale)
      const sourceY = Math.max(0, cropTopInDisplay / scale)
      const sourceWidth = Math.min(imageSize.width - sourceX, boxWidth / scale)
      const sourceHeight = Math.min(imageSize.height - sourceY, boxHeight / scale)

      // Target canvas dimensions
      let outWidth = Math.min(targetMaxWidth, Math.round(sourceWidth))
      let outHeight = Math.round(outWidth / aspectRatio)

      if (outHeight > targetMaxHeight) {
        outHeight = targetMaxHeight
        outWidth = Math.round(outHeight * aspectRatio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(100, outWidth)
      canvas.height = Math.max(100, outHeight)

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not initialize canvas context')

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      ctx.drawImage(
        imageRef.current,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      )

      // Export as webp blob (fallback to jpeg)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp', 0.92)
      })

      if (!blob) throw new Error('Failed to render cropped image blob')

      const originalName = imageFile.name.replace(/\.[^/.]+$/, '')
      const croppedFile = new File([blob], `${originalName}-cropped.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      await onCropComplete(croppedFile)
    } catch (err: any) {
      console.error('Cropping error:', err)
      setCropError(err.message || 'Failed to process crop')
    }
  }

  if (!isOpen || !imageFile) return null

  const { scale } = getScaleAndBounds()
  const displayWidth = imageSize ? imageSize.width * scale : boxWidth
  const displayHeight = imageSize ? imageSize.height * scale : boxHeight

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-canvas/80 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-lg border border-line bg-panel p-4 sm:p-6 shadow-2xl relative flex flex-col gap-3.5 sm:gap-4.5 rounded-xs my-auto max-h-[94vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line pb-2.5 sm:pb-3">
          <div className="pr-2 min-w-0">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue block mb-0.5 truncate">
              {subtitle}
            </span>
            <h2 className="font-serif italic text-lg sm:text-xl text-ink truncate">
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer disabled:opacity-40 p-1.5 -mr-1 -mt-1 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {cropError && (
          <div className="p-2.5 sm:p-3 border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-mono text-[10.5px]">
            {cropError}
          </div>
        )}

        {/* Viewport Guidance */}
        <p className="font-sans text-[11px] sm:text-xs text-ink-soft leading-relaxed">
          Drag to reposition artwork. Use the slider or pinch to zoom.
        </p>

        {/* Crop Viewport Wrapper (measures available container width) */}
        <div ref={wrapperRef} className="w-full flex items-center justify-center py-0.5 overflow-hidden">
          <div
            ref={cropBoxRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative bg-canvas-deep border border-line overflow-hidden flex items-center justify-center select-none touch-none cursor-grab active:cursor-grabbing shadow-inner shrink-0"
            style={{ width: `${boxWidth}px`, height: `${boxHeight}px` }}
          >
            {/* Loaded Image */}
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop target"
                draggable={false}
                className="max-w-none pointer-events-none absolute transition-none"
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                  left: `calc(50% - ${displayWidth / 2}px + ${offset.x}px)`,
                  top: `calc(50% - ${displayHeight / 2}px + ${offset.y}px)`,
                }}
              />
            )}

            {/* Rule of Thirds Grid Overlay */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none border border-line-soft/80">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div />
            </div>

            {/* Circular Mask Outline if Avatar */}
            {isCircularMask && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className="rounded-full border-2 border-dashed border-white/80 shadow-2xs pointer-events-none"
                  style={{
                    width: `${Math.min(boxWidth, boxHeight) * 0.94}px`,
                    height: `${Math.min(boxWidth, boxHeight) * 0.94}px`,
                  }}
                />
              </div>
            )}

            {/* Corner Framing Guides */}
            <div className="absolute top-1 left-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-t-2 border-l-2 border-blue pointer-events-none" />
            <div className="absolute top-1 right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-t-2 border-r-2 border-blue pointer-events-none" />
            <div className="absolute bottom-1 left-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-b-2 border-l-2 border-blue pointer-events-none" />
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-b-2 border-r-2 border-blue pointer-events-none" />
          </div>
        </div>

        {/* Controls: Zoom & Reset */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 pt-2 border-t border-line-soft">
          <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft shrink-0">
              Zoom:
            </span>
            <button
              type="button"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(2))))}
              className="w-7 h-7 sm:w-6 sm:h-6 border border-line bg-canvas hover:border-ink text-ink font-mono text-sm sm:text-xs flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
              aria-label="Zoom out"
            >
              −
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 sm:w-44 accent-blue cursor-pointer h-2"
            />
            <button
              type="button"
              disabled={zoom >= 3}
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
              className="w-7 h-7 sm:w-6 sm:h-6 border border-line bg-canvas hover:border-ink text-ink font-mono text-sm sm:text-xs flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
              aria-label="Zoom in"
            >
              +
            </button>
            <span className="font-mono text-[10px] text-ink-soft w-8 text-right shrink-0">
              {zoom.toFixed(1)}x
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            }}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft hover:text-ink border border-line py-1.5 px-3 bg-canvas hover:bg-canvas-deep cursor-pointer text-center shrink-0 self-end sm:self-auto"
          >
            Reset Framing
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2.5 sm:pt-3 border-t border-line">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.14em] py-2.5 sm:py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50 text-center"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !imageSize}
            onClick={handleConfirmCrop}
            className="font-mono text-[11px] uppercase tracking-[0.14em] py-2.5 sm:py-2 px-5 bg-ink text-canvas font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-xs"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-canvas border-t-transparent rounded-full animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <span>Confirm & Upload</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
