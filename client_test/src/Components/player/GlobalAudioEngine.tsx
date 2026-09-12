import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { usePlayerStore } from "../../stores/player.store";
import { useEntitlementsStore } from "../../stores/entitlements.store";
import { playerApi } from "../../lib/player.api";

export function GlobalAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);

  const _setStatus = usePlayerStore((s) => s._setStatus);
  const _setCurrentTime = usePlayerStore((s) => s._setCurrentTime);
  const _setDuration = usePlayerStore((s) => s._setDuration);
  const _setError = usePlayerStore((s) => s._setError);
  const _setStreamQuality = usePlayerStore((s) => s._setStreamQuality);
  const next = usePlayerStore((s) => s.next);
  const initializeSync = usePlayerStore((s) => s.initializeSync);

  // Initialize playback snapshot from localStorage / server on mount
  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  // Clean up HLS instance
  const destroyHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  // 1. Handle Track Changes & Stream URL Resolution
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    // Only load if track changed
    if (lastTrackIdRef.current === currentTrack.id) return;
    lastTrackIdRef.current = currentTrack.id;

    let isCancelled = false;
    _setStatus("loading");
    destroyHls();

    const loadAudioSource = async () => {
      try {
        const wantsLossless = useEntitlementsStore.getState().hasEntitlement("lossless");
        let streamUrl = currentTrack.audioUrl || currentTrack.rawAudioKey || "";
        let hlsUrl = currentTrack.hlsManifestUrl;
        let quality: "lossless" | "standard" = "standard";

        // Resolve authenticated stream gate from server
        try {
          const res = await playerApi.getStreamUrl(currentTrack.id, wantsLossless);
          if (res) {
            streamUrl = res.streamUrl || res.audioUrl || streamUrl;
            hlsUrl = res.hlsManifestUrl || hlsUrl;
            quality = res.quality || "standard";
          }
        } catch {
          // Fall back to direct audioUrl from track props if offline/dev
        }

        if (isCancelled) return;
        _setStreamQuality(quality);

        // A. Adaptive HLS Streaming via Hls.js
        if (hlsUrl && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 60,
          });
          hlsRef.current = hls;

          hls.loadSource(hlsUrl);
          hls.attachMedia(audio);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!isCancelled) {
              audio.play().catch(() => {
                _setStatus("paused");
              });
            }
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.warn("[AudioEngine] HLS fatal error, falling back to direct audio stream:", data);
              destroyHls();
              // Graceful fallback to direct audio URL
              if (streamUrl) {
                audio.src = streamUrl;
                audio.play().catch(() => _setStatus("paused"));
              } else {
                _setError("Audio stream unavailable");
              }
            }
          });
        }
        // B. Native HLS (e.g. Safari / iOS)
        else if (hlsUrl && audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.src = hlsUrl;
          audio.play().catch(() => _setStatus("paused"));
        }
        // C. Standard Progressive Streaming (MP3 / AAC / FLAC / Direct CDN)
        else if (streamUrl) {
          audio.src = streamUrl;
          audio.play().catch(() => _setStatus("paused"));
        } else {
          _setError("No playable audio URL found for this track");
        }
      } catch (err: any) {
        if (!isCancelled) {
          _setError(err.message || "Failed to load audio");
        }
      }
    };

    loadAudioSource();

    return () => {
      isCancelled = true;
    };
  }, [currentTrack, _setStatus, _setStreamQuality, _setError]);

  // 2. Sync Play/Pause status or Stop
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack || playbackStatus === "idle") {
      audio.pause();
      audio.src = "";
      destroyHls();
      lastTrackIdRef.current = null;
      return;
    }

    if (playbackStatus === "playing" && audio.paused) {
      audio.play().catch(() => _setStatus("paused"));
    } else if (playbackStatus === "paused" && !audio.paused) {
      audio.pause();
    }
  }, [playbackStatus, currentTrack, _setStatus]);

  // 3. Sync Volume & Mute
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // 4. Handle External Seek Scrubber Dragging
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Only update if difference is more than 1 second to avoid loopback jitter
    if (Math.abs(audio.currentTime - currentTime) > 1.2) {
      audio.currentTime = currentTime;
    }
  }, [currentTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyHls();
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      className="hidden"
      onTimeUpdate={() => {
        if (audioRef.current) {
          _setCurrentTime(audioRef.current.currentTime);
        }
      }}
      onDurationChange={() => {
        if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
          _setDuration(audioRef.current.duration);
        }
      }}
      onWaiting={() => _setStatus("loading")}
      onPlaying={() => _setStatus("playing")}
      onPause={() => _setStatus("paused")}
      onEnded={() => next()}
      onError={(e) => {
        const error = (e.target as HTMLAudioElement)?.error;
        console.warn("[AudioEngine] Native HTML5 Audio error:", error);
        // Do not block UI if initial empty or unmounted
        if (currentTrack) {
          _setError("Playback error");
        }
      }}
    />
  );
}
