import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { usePlayerStore } from "../../stores/player.store";
import { useEntitlementsStore } from "../../stores/entitlements.store";
import { useAuthStore } from "../../stores/auth.store";
import { playerApi } from "../../lib/player.api";
import { getDeviceInfo } from "../../lib/device";

export function GlobalAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const qualifiedReportedTrackIdRef = useRef<string | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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

    // Check if audio element actually has a valid source loaded
    const hasSource =
      (!!audio.src &&
        audio.src !== window.location.href &&
        !audio.src.endsWith("/")) ||
      !!hlsRef.current;

    // Only skip if track hasn't changed AND audio source is already active
    if (lastTrackIdRef.current === currentTrack.id && hasSource) return;
    lastTrackIdRef.current = currentTrack.id;
    qualifiedReportedTrackIdRef.current = null;

    // Record any initial saved position to seek safely once metadata is ready
    const initialTime = usePlayerStore.getState().currentTime;
    if (initialTime > 0) {
      pendingSeekTimeRef.current = initialTime;
    }

    let isCancelled = false;
    const isExplicitPlay =
      usePlayerStore.getState().playbackStatus !== "paused" &&
      usePlayerStore.getState().playbackStatus !== "idle";
    if (isExplicitPlay) {
      _setStatus("loading");
    }
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

        const playOrHold = () => {
          if (isCancelled) return;
          const targetStatus = usePlayerStore.getState().playbackStatus;

          // Apply pending seek safely if metadata is already loaded
          if (
            pendingSeekTimeRef.current !== null &&
            audio.readyState >= 1 &&
            Number.isFinite(audio.duration)
          ) {
            audio.currentTime = Math.min(pendingSeekTimeRef.current, audio.duration);
            pendingSeekTimeRef.current = null;
          }

          if (targetStatus === "playing" || targetStatus === "loading") {
            audio.play().catch(() => {
              _setStatus("paused");
            });
          } else {
            _setStatus("paused");
          }
        };

        // A. Adaptive HLS Streaming via Hls.js
        if (hlsUrl && Hls.isSupported()) {
          const startPos =
            pendingSeekTimeRef.current && pendingSeekTimeRef.current > 0
              ? pendingSeekTimeRef.current
              : -1;
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 60,
            startPosition: startPos,
          });
          hlsRef.current = hls;

          hls.loadSource(hlsUrl);
          hls.attachMedia(audio);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            playOrHold();
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.warn("[AudioEngine] HLS fatal error, falling back to direct audio stream:", data);
              destroyHls();
              // Graceful fallback to direct audio URL
              if (streamUrl) {
                audio.src = streamUrl;
                playOrHold();
              } else {
                _setError("Audio stream unavailable");
              }
            }
          });
        }
        // B. Native HLS (e.g. Safari / iOS)
        else if (hlsUrl && audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.src = hlsUrl;
          playOrHold();
        }
        // C. Standard Progressive Streaming (MP3 / AAC / FLAC / Direct CDN)
        else if (streamUrl) {
          audio.src = streamUrl;
          playOrHold();
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
      pendingSeekTimeRef.current = null;
      return;
    }

    const hasSource =
      (!!audio.src &&
        audio.src !== window.location.href &&
        !audio.src.endsWith("/")) ||
      !!hlsRef.current;

    if (playbackStatus === "playing") {
      if (!hasSource) {
        lastTrackIdRef.current = null;
        return;
      }
      if (audio.paused) {
        audio.play().catch(() => _setStatus("paused"));
      }
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
    if (!audio || !currentTrack) return;

    // If media element metadata isn't ready yet, defer seek to onLoadedMetadata / onCanPlay
    if (audio.readyState < 1 || !Number.isFinite(audio.duration)) {
      pendingSeekTimeRef.current = currentTime;
      return;
    }

    // Only update if difference is more than 1.2 seconds to avoid loopback jitter
    if (Math.abs(audio.currentTime - currentTime) > 1.2) {
      audio.currentTime = Math.min(currentTime, audio.duration);
    }
  }, [currentTime, currentTrack]);

  // 5. Multi-Device Heartbeat Loop & Presence (Every 15s when authenticated & playing)
  useEffect(() => {
    if (!isAuthenticated || !currentTrack || playbackStatus !== "playing") {
      return;
    }

    const { deviceId, deviceName } = getDeviceInfo();
    let isTerminated = false;

    const pingHeartbeat = async (isTakeover = false) => {
      const audio = audioRef.current;
      if (!audio || isTerminated) return;

      try {
        const res = await playerApi.sendHeartbeat({
          deviceId,
          deviceName,
          songId: currentTrack.id,
          trackTitle: currentTrack.title,
          artistName: currentTrack.artistName,
          coverImageUrl: currentTrack.coverImageUrl,
          progressMs: Math.floor(audio.currentTime * 1000),
          durationMs: currentTrack.durationSeconds ? currentTrack.durationSeconds * 1000 : undefined,
          isPaused: false,
          takeover: isTakeover,
        });

        if (isTerminated) return;

        if (res.status === "superseded" && res.activeDevice) {
          // Graceful 300ms volume fade-out
          const initialVol = audio.volume;
          const fadeSteps = 6;
          const stepTime = 50;
          let currentStep = 0;

          const fadeInterval = setInterval(() => {
            currentStep++;
            if (audio && currentStep <= fadeSteps) {
              audio.volume = Math.max(0, initialVol * (1 - currentStep / fadeSteps));
            } else {
              clearInterval(fadeInterval);
              if (audio) {
                audio.pause();
                audio.volume = isMuted ? 0 : volume; // Restore base volume setting
              }
              usePlayerStore.setState({
                playbackStatus: "paused",
                supersededByDevice: res.activeDevice,
              });
            }
          }, stepTime);
        }
      } catch {
        // Silently tolerate temporary network blips
      }
    };

    // Immediate heartbeat on starting playback
    pingHeartbeat();

    // Routine 15s pulse
    const interval = setInterval(() => {
      pingHeartbeat();
    }, 15000);

    return () => {
      isTerminated = true;
      clearInterval(interval);
    };
  }, [currentTrack, playbackStatus, isAuthenticated, volume, isMuted]);

  // 6. 30-Second Qualified Play Telemetry Tracker
  useEffect(() => {
    if (!currentTrack || playbackStatus !== "playing") return;

    const threshold =
      currentTrack.durationSeconds > 0 && currentTrack.durationSeconds < 30
        ? currentTrack.durationSeconds * 0.5
        : 30;

    if (
      currentTime >= threshold &&
      qualifiedReportedTrackIdRef.current !== currentTrack.id
    ) {
      qualifiedReportedTrackIdRef.current = currentTrack.id;
      playerApi
        .sendTelemetry({
          songId: currentTrack.id,
          durationListenedSeconds: Math.floor(currentTime),
          completed: false,
        })
        .catch(() => {});
    }
  }, [currentTime, currentTrack, playbackStatus]);

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
      onLoadedMetadata={() => {
        if (audioRef.current) {
          const audio = audioRef.current;
          if (Number.isFinite(audio.duration)) {
            _setDuration(audio.duration);
          }
          if (
            pendingSeekTimeRef.current !== null &&
            Number.isFinite(audio.duration)
          ) {
            audio.currentTime = Math.min(
              pendingSeekTimeRef.current,
              audio.duration
            );
            pendingSeekTimeRef.current = null;
          }
        }
      }}
      onDurationChange={() => {
        if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
          _setDuration(audioRef.current.duration);
        }
      }}
      onWaiting={() => _setStatus("loading")}
      onPlay={() => _setStatus("playing")}
      onPlaying={() => _setStatus("playing")}
      onCanPlay={() => {
        if (audioRef.current) {
          const audio = audioRef.current;
          if (
            pendingSeekTimeRef.current !== null &&
            Number.isFinite(audio.duration)
          ) {
            audio.currentTime = Math.min(
              pendingSeekTimeRef.current,
              audio.duration
            );
            pendingSeekTimeRef.current = null;
          }
          if (!audio.paused) {
            _setStatus("playing");
          }
        }
      }}
      onPause={() => _setStatus("paused")}
      onEnded={() => {
        if (currentTrack) {
          playerApi
            .sendTelemetry({
              songId: currentTrack.id,
              durationListenedSeconds: Math.floor(audioRef.current?.currentTime || 0),
              completed: true,
            })
            .catch(() => {});
        }
        next();
      }}
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
