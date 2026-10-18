import { useEffect } from 'react'
import {
  Check,
  Laptop,
  Monitor,
  MonitorSpeaker,
  Play,
  RefreshCw,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react'
import { usePlayerStore } from '../../stores/player.store'
import { useConnectStore } from '../../stores/connect.store'
import { useAuthStore } from '../../stores/auth.store'
import { Sheet } from '../ui'
import type { PlayerDeviceView } from '../../lib/player.api'

interface DevicesContentProps {
  mode: 'desktop' | 'mobile'
  onClose: () => void
}

/** Picks an icon that matches what the device registry recorded. */
function DeviceIcon({ name }: { name: string }) {
  const n = name.toLowerCase()
  const className = 'w-5 h-5 shrink-0'
  if (n.includes('iphone') || n.includes('phone') || n.includes('android'))
    return <Smartphone className={className} strokeWidth={2} />
  if (n.includes('ipad') || n.includes('tablet'))
    return <Tablet className={className} strokeWidth={2} />
  if (n.includes('macbook') || n.includes('laptop'))
    return <Laptop className={className} strokeWidth={2} />
  return <Monitor className={className} strokeWidth={2} />
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

/**
 * The Devices panel: which device is the Speaker, where the needle is, and every
 * device on the account. Rendered in the desktop right sidebar and, unchanged,
 * inside the mobile bottom sheet — so "Play here" exists on the phone too
 * (rule R1, and the fix for the missing-phone bug).
 */
export function DevicesContent({ mode, onClose }: DevicesContentProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const devices = useConnectStore((s) => s.devices)
  const sessionView = useConnectStore((s) => s.sessionView)
  const youAreSpeaker = useConnectStore((s) => s.youAreSpeaker)
  const livePositionMs = useConnectStore((s) => s.livePositionMs)
  const myDeviceId = useConnectStore((s) => s.myDeviceId)
  const isRefreshing = useConnectStore((s) => s.isRefreshing)
  const isPlayHerePending = useConnectStore((s) => s.isPlayHerePending)
  const error = useConnectStore((s) => s.error)
  const commandError = useConnectStore((s) => s.commandError)
  const refresh = useConnectStore((s) => s.refresh)
  const playHere = useConnectStore((s) => s.playHere)
  const transferTo = useConnectStore((s) => s.transferTo)
  const transferPending = useConnectStore((s) => s.transferPending)
  const forgetDevice = useConnectStore((s) => s.forgetDevice)
  const clearError = useConnectStore((s) => s.clearError)
  const clearCommandError = useConnectStore((s) => s.clearCommandError)
  const clearTransferError = useConnectStore((s) => s.clearTransferError)
  const transferError = useConnectStore((s) => s.transferError)

  const localTime = usePlayerStore((s) => s.currentTime)
  const localTrack = usePlayerStore((s) => s.currentTrack)

  // Refresh whenever the panel is opened, so it is never stale.
  useEffect(() => {
    if (isAuthenticated) void refresh()
  }, [isAuthenticated, refresh])

  const speaker = sessionView?.session.speaker ?? null
  const speakerOnline = sessionView?.speakerOnline ?? false
  const isPlaying = sessionView?.session.playback.isPlaying ?? false
  const sessionTrack = sessionView?.session.playback.track ?? null

  // While this device is the Speaker, the local player is the truth for the
  // needle; otherwise the session's needle, interpolated locally between the
  // sparse POSITION events, is (rules B2).
  const displayTrack = youAreSpeaker ? localTrack : sessionTrack
  const displaySeconds = youAreSpeaker ? localTime : livePositionMs / 1000

  const isSomeoneElseSpeaker = Boolean(speaker) && !youAreSpeaker
  // A handshake in flight: the role is *promised* but not owned yet (rule A9).
  // Until it resolves, nobody has the room, so the panel must not pretend.
  const transferInFlight = Boolean(speaker && !speaker.confirmed)
  const isSomeoneElseSpeakerSettled = isSomeoneElseSpeaker && !transferInFlight
  // Rule B6: the Speaker is gone — the session is frozen where it stopped and
  // the only useful offer is to continue here.
  const speakerOffline = Boolean(isSomeoneElseSpeakerSettled && speaker && !speakerOnline)
  const canPlayHere =
    !youAreSpeaker && !transferInFlight && Boolean(displayTrack)

  const listClass =
    mode === 'desktop'
      ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-4 sm:px-5 pb-5 space-y-2'
      : 'px-4 pb-5 space-y-2'

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-card text-foreground">
      {/* ===================== HEADER ===================== */}
      <div className="h-14 border-b border-border px-4 sm:px-5 flex items-center justify-between shrink-0 gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <MonitorSpeaker
            className="w-5 h-5 text-muted-foreground"
            strokeWidth={2}
          />
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold truncate">
            Devices
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            title="Refresh devices"
            aria-label="Refresh devices"
            className="p-1.5 rounded-control text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
              strokeWidth={2}
            />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Devices"
            title="Close Devices"
            className="p-1.5 rounded-control text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ===================== NOW PLAYING / CURRENT SPEAKER ===================== */}
      <div className="shrink-0 px-4 sm:px-5 pt-4 pb-3 border-b border-border/60">
        {isAuthenticated ? (
          <>
            <div className="rounded-inset border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative shrink-0">
                  {isPlaying && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      isPlaying ? 'bg-success' : 'bg-muted-foreground/50'
                    }`}
                  />
                </span>

                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground truncate">
                  {youAreSpeaker
                    ? isPlaying
                      ? 'Playing here'
                      : 'Paused here'
                    : transferInFlight
                      ? 'Moving playback to'
                      : isSomeoneElseSpeaker
                        ? 'Controlling playback on'
                        : 'Nothing playing'}
                </span>

                {(isSomeoneElseSpeaker || transferInFlight) && (
                  <span className="font-semibold text-caption text-foreground truncate">
                    {speaker?.deviceName}
                  </span>
                )}

                {speakerOffline && (
                  <span className="ml-auto font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control bg-muted text-muted-foreground border border-border shrink-0">
                    Offline
                  </span>
                )}
              </div>

              {displayTrack ? (
                <div className="flex items-center gap-2.5 mt-2.5">
                  <div className="w-9 h-9 rounded-md bg-muted border border-border/60 overflow-hidden shrink-0">
                    {displayTrack.coverImageUrl ? (
                      <img
                        src={displayTrack.coverImageUrl}
                        alt={displayTrack.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-serif italic text-caption text-muted-foreground">
                        ♪
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-caption text-foreground truncate leading-tight">
                      {displayTrack.title}
                    </div>
                    <div className="text-eyebrow text-muted-foreground truncate leading-tight mt-0.5 tabular-nums">
                      {displayTrack.artistName}
                      {displaySeconds > 0 && ` · ${formatTime(displaySeconds)}`}
                    </div>
                  </div>
                </div>
              ) : null}

              {canPlayHere && (
                <button
                  type="button"
                  onClick={() => void playHere()}
                  disabled={isPlayHerePending}
                  className="mt-3 w-full min-h-9 inline-flex items-center justify-center gap-2 bg-foreground text-background hover:bg-primary hover:text-primary-foreground disabled:opacity-60 px-3.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider transition-colors rounded-control cursor-pointer shadow-raised font-medium"
                >
                  <Play className="w-4 h-4" strokeWidth={2.5} />
                  {isPlayHerePending
                    ? 'Moving…'
                    : speakerOffline
                      ? 'Play here instead'
                      : 'Play here'}
                </button>
              )}

              {speakerOffline && speaker && (
                <p className="text-eyebrow text-muted-foreground mt-2 leading-snug">
                  {speaker.deviceName} is offline. Playback is parked at the last
                  position — take it over here and carry on from there.
                </p>
              )}
            </div>

            {error && (
              <div className="mt-2 flex items-start justify-between gap-2 rounded-inset border border-destructive/40 bg-destructive-soft px-3 py-2">
                <span className="text-caption text-destructive leading-snug">
                  {error}
                </span>
                <button
                  type="button"
                  onClick={clearError}
                  aria-label="Dismiss"
                  className="text-destructive/70 hover:text-destructive cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            )}

            {/* A push transfer that was refused or never landed. Quiet by
                design: the user tapped a device and it simply didn't move
                (rules A6 / B3). */}
            {transferError && !error && (
              <div className="mt-2 flex items-start justify-between gap-2 rounded-inset border border-border bg-muted px-3 py-2">
                <span className="text-caption text-foreground leading-snug">
                  {transferError}
                </span>
                <button
                  type="button"
                  onClick={clearTransferError}
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            )}

            {/* A command that never reached the Speaker. Quiet by design: the
                user pressed a button and it simply didn't land (rule B3). */}
            {commandError && !error && (
              <div className="mt-2 flex items-start justify-between gap-2 rounded-inset border border-border bg-muted px-3 py-2">
                <span className="text-caption text-foreground leading-snug">
                  {commandError}
                </span>
                <button
                  type="button"
                  onClick={clearCommandError}
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-caption text-muted-foreground leading-snug">
            Sign in to see your devices and move playback between them.
          </p>
        )}
      </div>

      {/* ===================== DEVICE LIST ===================== */}
      <div className={listClass}>
        {isAuthenticated && devices.length === 0 && !isRefreshing && (
          <p className="text-caption text-muted-foreground py-6 text-center">
            No devices registered yet.
          </p>
        )}

        {isAuthenticated &&
          devices.map((device) => (
            <DeviceRow
              key={device.deviceId}
              device={device}
              isMine={device.deviceId === myDeviceId}
              isMoving={transferPending?.deviceId === device.deviceId}
              onPlayOn={() => void transferTo(device)}
              onForget={() => void forgetDevice(device.deviceId)}
            />
          ))}

        {isAuthenticated && (
          <p className="text-eyebrow text-muted-foreground leading-relaxed pt-3 px-1">
            One stream at a time. Your queue, position and mix travel between
            devices — volume and mute stay on each device.
          </p>
        )}
      </div>
    </div>
  )
}

function DeviceRow({
  device,
  isMine,
  isMoving,
  onPlayOn,
  onForget,
}: {
  device: PlayerDeviceView
  isMine: boolean
  /** A push this tab started is currently heading to this device. */
  isMoving: boolean
  onPlayOn: () => void
  onForget: () => void
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-inset border px-3 py-2.5 transition-colors ${
        device.isSpeaker
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-background hover:bg-muted'
      } ${device.online ? '' : 'opacity-60'}`}
    >
      <span className="text-muted-foreground">
        <DeviceIcon name={device.deviceName} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-caption text-foreground truncate">
            {device.deviceName}
          </span>

          {device.isSpeaker && (
            <span className="shrink-0 inline-flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control bg-primary/15 text-primary border border-primary/30">
              <Check className="w-3 h-3" strokeWidth={3} />
              Playing
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {isMine && (
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
              This device
            </span>
          )}
          <span
            className={`font-eyebrow text-eyebrow uppercase tracking-wider ${
              device.online ? 'text-success' : 'text-muted-foreground'
            }`}
          >
            {device.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {!device.isSpeaker && !isMine && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Rule A2: only an explicit action moves the Speaker, so the push is
              a labelled button rather than a clickable row. Rule A6: an offline
              target is visibly unavailable rather than silently ignored. */}
          <button
            type="button"
            onClick={onPlayOn}
            disabled={!device.online || isMoving}
            title={
              device.online
                ? `Play on ${device.deviceName}`
                : `${device.deviceName} isn't available right now.`
            }
            aria-label={`Play on ${device.deviceName}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-control border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted font-eyebrow text-eyebrow uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Play className="w-3 h-3" strokeWidth={2.5} />
            {isMoving ? 'Moving…' : 'Play on'}
          </button>

          <button
            type="button"
            onClick={onForget}
            title={`Forget ${device.deviceName}`}
            aria-label={`Forget ${device.deviceName}`}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 rounded-control text-muted-foreground hover:text-destructive cursor-pointer transition-all shrink-0"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Mobile bottom sheet wrapper. Reuses the shared overlay shell so the devices
 * panel behaves exactly like every other sheet in the app.
 */
export function DeviceSheet() {
  const isDevicesOpen = usePlayerStore((s) => s.isDevicesOpen)
  const setDevicesOpen = usePlayerStore((s) => s.setDevicesOpen)

  return (
    <div className="md:hidden">
      <Sheet
        open={isDevicesOpen}
        onClose={() => setDevicesOpen(false)}
        hideHandle={false}
      >
        <DevicesContent mode="mobile" onClose={() => setDevicesOpen(false)} />
      </Sheet>
    </div>
  )
}
