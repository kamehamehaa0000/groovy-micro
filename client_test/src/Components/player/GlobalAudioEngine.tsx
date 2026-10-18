import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { usePlayerStore } from "../../stores/player.store";
import { useConnectStore, selectIsRemote } from "../../stores/connect.store";
import { useJamStore } from "../../stores/jam.store";
import { useEntitlementsStore } from "../../stores/entitlements.store";
import { useAuthStore } from "../../stores/auth.store";
import { playerApi } from "../../lib/player.api";
import { getDeviceInfo, getInstanceId, isAudioUnlocked, markAudioUnlocked } from "../../lib/device";
import { usePlayerKeyboardControls } from "../../hooks/usePlayerKeyboardControls";

export function GlobalAudioEngine() {
  // Mount high-efficiency global player keyboard controls
  usePlayerKeyboardControls();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const qualifiedReportedTrackIdRef = useRef<string | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const isSourceChangingRef = useRef<boolean>(false);
  const lastHeartbeatTimeRef = useRef<number>(0);

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
  const _setStreamFormat = usePlayerStore((s) => s._setStreamFormat);
  const next = usePlayerStore((s) => s.next);
  const initializeSync = usePlayerStore((s) => s.initializeSync);

  // Groovy Connect: true when another device owns the session. It is subscribed
  // rather than read on demand so the effects below re-run the moment the role
  // flips — that is what makes a handed-over Remote stop, and a pulled device
  // start, without a remount (design doc rule B2).
  const isRemote = useConnectStore((s) => selectIsRemote(s));

  // Fallback and recovery tracking refs
  const isFallingBackRef = useRef<boolean>(false);
  const hlsRecoveryAttemptsRef = useRef<number>(0);
  const activeSourceTypeRef = useRef<"hls" | "native-hls" | "direct" | null>(null);
  const fallbackUrlRef = useRef<string | null>(null);

  // Initialize playback snapshot from localStorage / server on mount
  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  // Register this tab with Groovy Connect as soon as we know who the user is.
  // Gated on auth rather than on mount, because auth can resolve after the
  // engine mounts — and this is what makes the Devices panel (and the
  // "Playing on {device}" strip) correct the moment the app opens.
  // See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.
  useEffect(() => {
    if (!isAuthenticated) return;
    // The registration response already carries the session and the device list,
    // so one request is enough for a correct first paint.
    void useConnectStore
      .getState()
      .register()
      .catch(() => {
        // Registration is best-effort; the player still works offline.
      });
  }, [isAuthenticated]);

  // Groovy Connect realtime stream. While this is open, another device's
  // transfer, a play/pause or a device joining reaches us in about a second
  // instead of waiting for the next needle tick. It is also how this device is
  // told it lost the Speaker role. See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.
  useEffect(() => {
    if (!isAuthenticated) return;
    const disconnect = useConnectStore.getState().connectEvents();
    return disconnect;
  }, [isAuthenticated]);

  // Stand down when another device takes the Speaker role. Exactly one place
  // performs the fade, so it does not matter how the news arrived — the
  // realtime stream, a heartbeat, or a rejected needle tick (rule C1).
  const speakerYieldedAt = usePlayerStore((s) => s.speakerYieldedBy?.at ?? null);
  const lastYieldHandledRef = useRef<number | null>(null);
  useEffect(() => {
    if (!speakerYieldedAt) return;
    // Each yield is handled exactly once, so a remount (or a dev double-invoke)
    // cannot fade out a device that is already standing down.
    if (lastYieldHandledRef.current === speakerYieldedAt) return;
    lastYieldHandledRef.current = speakerYieldedAt;

    useConnectStore.getState().setYouAreSpeaker(false);

    const audio = audioRef.current;
    if (!audio) return;

    // Graceful 300ms volume fade-out so the handover does not click.
    const baseVolume = audio.volume;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      if (step <= 6) {
        audio.volume = Math.max(0, baseVolume * (1 - step / 6));
        return;
      }
      clearInterval(timer);
      audio.pause();
      const { isMuted: muted, volume } = usePlayerStore.getState();
      audio.volume = muted ? 0 : volume; // Restore the base volume setting
      const yielded = usePlayerStore.getState().speakerYieldedBy;
      usePlayerStore.setState({
        playbackStatus: "paused",
        supersededByDevice: yielded?.deviceName
          ? { deviceId: yielded.deviceId, deviceName: yielded.deviceName }
          : null,
      });
    }, 50);

    return () => clearInterval(timer);
  }, [speakerYieldedAt]);

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

    // Rule B2: a Remote produces no audio. It mirrors the session's track into
    // the store for display, but it must never resolve or play a stream — that
    // would make two devices play the same account at once.
    if (isRemote) {
      destroyHls();
      lastTrackIdRef.current = null;
      pendingSeekTimeRef.current = null;
      if (!audio.paused) audio.pause();
      // Release the decoder too: a Remote holding a stale stream open is pure
      // waste, and it keeps the element inert so no media event can fire.
      if (audio.src) {
        audio.removeAttribute("src");
        audio.load();
      }
      return;
    }

    // Check if audio element actually has a valid source loaded
    const hasSource =
      (!!audio.src &&
        audio.src !== window.location.href &&
        !audio.src.endsWith("/")) ||
      !!hlsRef.current;

    // Only skip if track hasn't changed AND audio source is already active
    if (lastTrackIdRef.current === currentTrack.id && hasSource) return;

    // Detect Immediate Skip Telemetry on previous track (< 5 seconds)
    if (lastTrackIdRef.current && lastTrackIdRef.current !== currentTrack.id) {
      const prevTrackId = lastTrackIdRef.current;
      const prevTime = audio.currentTime || 0;
      if (prevTime < 5 && qualifiedReportedTrackIdRef.current !== prevTrackId) {
        playerApi
          .sendTelemetry({
            songId: prevTrackId,
            durationListenedSeconds: Math.floor(prevTime),
            completed: false,
            countPlay: false,
            skipped: true,
            skipDurationSeconds: Math.max(1, Math.floor(prevTime)),
          })
          .catch(() => {});
      }
    }

    lastTrackIdRef.current = currentTrack.id;
    qualifiedReportedTrackIdRef.current = null;

    // Reset fallback state for the new track
    isFallingBackRef.current = false;
    hlsRecoveryAttemptsRef.current = 0;
    activeSourceTypeRef.current = null;
    fallbackUrlRef.current = null;
    isSourceChangingRef.current = true;

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

    if (currentTrack.isStreamable === false) {
      _setError("Track is unreleased or not streamable");
      _setStatus("error");
      return;
    }

    const loadAudioSource = async () => {
      try {
        const wantsLossless = useEntitlementsStore.getState().hasEntitlement("lossless");
        let fallbackAudioUrl = currentTrack.audioUrl || currentTrack.rawAudioKey || "";
        let hlsUrl = currentTrack.hlsManifestUrl || null;
        let quality: "lossless" | "standard" = "standard";

        // Resolve authenticated stream gate from server
        try {
          const res = await playerApi.getStreamUrl(currentTrack.id, wantsLossless);
          if (res) {
            fallbackAudioUrl = res.audioUrl || fallbackAudioUrl;
            hlsUrl = res.hlsManifestUrl || hlsUrl;
            quality = res.quality || "standard";
          }
        } catch (err: any) {
          // If server explicitly returned 401/403 or access denied, do NOT fall back to audio
          const status = err?.status || err?.response?.status;
          const msg = (err?.message || "").toLowerCase();
          if (
            status === 401 ||
            status === 403 ||
            msg.includes("forbidden") ||
            msg.includes("unauthorized") ||
            msg.includes("denied") ||
            msg.includes("private")
          ) {
            if (isCancelled) return;
            _setError(err?.message || "Stream access denied");
            _setStatus("error");
            return;
          }
          // Otherwise fall back to direct audioUrl from track props if offline/dev
        }

        if (isCancelled) return;
        _setStreamQuality(quality);
        fallbackUrlRef.current = fallbackAudioUrl;

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
            audio
              .play()
              .then(() => {
                isSourceChangingRef.current = false;
                useJamStore.getState().setNeedsGesture(false);
              })
              .catch((err) => {
                isSourceChangingRef.current = false;
                if (err?.name === "AbortError") {
                  // Standard browser interruption due to rapid switch or source reload; do not set status to paused
                  return;
                }
                if (err?.name === "NotAllowedError" && useJamStore.getState().activeRoom) {
                  useJamStore.getState().setNeedsGesture(true);
                }
                _setStatus("paused");
              });
          } else {
            isSourceChangingRef.current = false;
            _setStatus("paused");
          }
        };

        const fallbackToDirectAudio = (reason?: string) => {
          if (isCancelled) return;
          if (isFallingBackRef.current) return;
          isFallingBackRef.current = true;
          activeSourceTypeRef.current = "direct";
          destroyHls();
          _setStreamFormat("progressive");

          const targetUrl = fallbackUrlRef.current;
          if (targetUrl) {
            console.info(
              `[AudioEngine] 🔄 Falling back from HLS to original direct audio (${reason || "HLS error"}):`,
              targetUrl
            );
            const currentPos = audio.currentTime || pendingSeekTimeRef.current || 0;
            if (currentPos > 0) {
              pendingSeekTimeRef.current = currentPos;
            }
            audio.src = targetUrl;
            playOrHold();
          } else {
            console.warn("[AudioEngine] ❌ No fallback direct audio URL available for this track");
            _setError("Audio stream unavailable");
          }
        };

        // A. Adaptive HLS Streaming via Hls.js
        if (hlsUrl && Hls.isSupported()) {
          activeSourceTypeRef.current = "hls";
          _setStreamFormat("hls");

          const startPos =
            pendingSeekTimeRef.current && pendingSeekTimeRef.current > 0
              ? pendingSeekTimeRef.current
              : -1;

          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 60,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            startPosition: startPos,
          });
          hlsRef.current = hls;

          hls.loadSource(hlsUrl);
          hls.attachMedia(audio);

          hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
            console.info(`[AudioEngine] 🎧 HLS Manifest parsed successfully (${data.levels.length} quality levels)`);
            playOrHold();
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            const level = hls.levels[data.level];
            if (level) {
              console.info(`[AudioEngine] 📶 HLS Level switched: ${data.level} (${Math.round(level.bitrate / 1000)} kbps)`);
            }
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (isCancelled) return;

            if (data.fatal) {
              console.warn("[AudioEngine] ⚠️ HLS fatal error encountered:", data.type, data.details);

              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (
                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
                    data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
                    data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
                    hlsRecoveryAttemptsRef.current >= 2
                  ) {
                    console.warn("[AudioEngine] HLS manifest/network load failed. Falling back to original direct MP3.");
                    fallbackToDirectAudio(data.details);
                  } else {
                    hlsRecoveryAttemptsRef.current++;
                    console.info(`[AudioEngine] Retrying HLS network load (attempt ${hlsRecoveryAttemptsRef.current})...`);
                    hls.startLoad();
                  }
                  break;

                case Hls.ErrorTypes.MEDIA_ERROR:
                  if (hlsRecoveryAttemptsRef.current < 2) {
                    hlsRecoveryAttemptsRef.current++;
                    console.info(`[AudioEngine] Recovering HLS media error (attempt ${hlsRecoveryAttemptsRef.current})...`);
                    hls.recoverMediaError();
                  } else {
                    console.warn("[AudioEngine] HLS media error recovery exhausted. Falling back to original direct MP3.");
                    fallbackToDirectAudio("Media error recovery exhausted");
                  }
                  break;

                default:
                  fallbackToDirectAudio(data.details || "Fatal HLS error");
                  break;
              }
            }
          });
        }
        // B. Native HLS (e.g. Safari / iOS)
        else if (hlsUrl && audio.canPlayType("application/vnd.apple.mpegurl")) {
          activeSourceTypeRef.current = "native-hls";
          _setStreamFormat("hls");
          audio.src = hlsUrl;
          playOrHold();
        }
        // C. Standard Progressive Streaming (MP3 / AAC / FLAC / Direct CDN)
        else if (fallbackAudioUrl) {
          activeSourceTypeRef.current = "direct";
          _setStreamFormat("progressive");
          audio.src = fallbackAudioUrl;
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
  }, [currentTrack, isRemote, _setStatus, _setStreamQuality, _setStreamFormat, _setError]);

  // 2. Sync Play/Pause status or Stop
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Rule B2: on a Remote the transport status describes the *session*, so it
    // must not be interpreted as "play this device".
    if (isRemote) {
      if (!audio.paused) audio.pause();
      return;
    }

    if (!currentTrack || playbackStatus === "idle") {
      if (lastTrackIdRef.current) {
        const prevTrackId = lastTrackIdRef.current;
        const prevTime = audio.currentTime || 0;
        if (prevTime < 5 && qualifiedReportedTrackIdRef.current !== prevTrackId) {
          playerApi
            .sendTelemetry({
              songId: prevTrackId,
              durationListenedSeconds: Math.floor(prevTime),
              completed: false,
              countPlay: false,
              skipped: true,
              skipDurationSeconds: Math.max(1, Math.floor(prevTime)),
            })
            .catch(() => {});
        }
      }
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
        audio
          .play()
          .then(() => {
            useJamStore.getState().setNeedsGesture(false);
          })
          .catch((err) => {
            if (err?.name === "AbortError") {
              // Standard browser interruption due to rapid switch or source reload; do not set status to paused
              return;
            }
            if (err?.name === "NotAllowedError" && useJamStore.getState().activeRoom) {
              useJamStore.getState().setNeedsGesture(true);
            }
            _setStatus("paused");
          });
      }
    } else if (playbackStatus === "paused" && !audio.paused) {
      audio.pause();
    }
  }, [playbackStatus, currentTrack, isRemote, _setStatus]);

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
    // On a Remote `currentTime` is a locally interpolated mirror of the
    // session's needle, not a command to move this device's audio (rule B2).
    if (isRemote) return;

    // If media element metadata isn't ready yet, defer seek to onLoadedMetadata / onCanPlay
    if (audio.readyState < 1 || !Number.isFinite(audio.duration)) {
      pendingSeekTimeRef.current = currentTime;
      return;
    }

    // Only update if difference is more than 1.2 seconds to avoid loopback jitter
    if (Math.abs(audio.currentTime - currentTime) > 1.2) {
      audio.currentTime = Math.min(currentTime, audio.duration);
    }
  }, [currentTime, currentTrack, isRemote]);

  // 5. Multi-Device Heartbeat Loop & Presence (Every 15s when authenticated & playing)
  useEffect(() => {
    // Rule B8: only the Speaker reports telemetry and claims the lease. A Remote
    // heartbeating would fight the actual Speaker for the role.
    if (isRemote) return;
    if (!isAuthenticated || !currentTrack || playbackStatus !== "playing") {
      return;
    }

    const { deviceId, deviceName } = getDeviceInfo();
    const instanceId = getInstanceId();
    let isTerminated = false;

    const pingHeartbeat = async (isTakeover = false) => {
      const audio = audioRef.current;
      if (!audio || isTerminated) return;

      // Minimum 5-second cooldown between non-takeover heartbeat requests to prevent any network storm
      const now = Date.now();
      if (!isTakeover && now - lastHeartbeatTimeRef.current < 5000) {
        return;
      }
      lastHeartbeatTimeRef.current = now;

      try {
        const res = await playerApi.sendHeartbeat({
          deviceId,
          deviceName,
          instanceId,
          unlocked: isAudioUnlocked(),
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
          // A refusal only counts if the session agrees this tab is not the
          // Speaker. The session is the source of truth; if it still names this
          // tab as the confirmed Speaker, the refusal came from stale state
          // (the legacy device lease a transfer does not move), so refresh and
          // keep playing. Standing down here is what used to silence *both*
          // devices after a push.
          if (useConnectStore.getState().youAreSpeaker) {
            void useConnectStore.getState().refresh();
            return;
          }
          // Another device took over. Route through the single stand-down path
          // (the store signal) instead of fading out here.
          usePlayerStore.getState().yieldSpeakerTo(res.activeDevice);
        } else {
          useConnectStore.getState().setYouAreSpeaker(true);
        }
      } catch {
        // Silently tolerate temporary network blips
      }
    };

    // Immediate heartbeat on starting playback (throttled by lastHeartbeatTimeRef)
    pingHeartbeat();

    // Routine 15s pulse
    const interval = setInterval(() => {
      pingHeartbeat();
    }, 15000);

    return () => {
      isTerminated = true;
      clearInterval(interval);
    };
  }, [currentTrack?.id, playbackStatus, isAuthenticated, isRemote]);

  // 5b. Groovy Connect keep-alive: private presence every 30s (so a paused
  //     device stays listed) plus the Speaker's 10s needle tick. The tick's
  //     position is re-stamped on the server clock, which is what removes
  //     cross-device drift. See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.
  useEffect(() => {
    if (!isAuthenticated) return;

    const { deviceId } = getDeviceInfo();
    const instanceId = getInstanceId();
    let cancelled = false;

    const sendPresence = async () => {
      if (cancelled) return;
      try {
        const res = await playerApi.sendPresence({
          deviceId,
          instanceId,
          unlocked: isAudioUnlocked(),
        });
        if (!cancelled && res?.devices) {
          useConnectStore.getState().setDevices(res.devices);
        }
      } catch {
        // Presence is best-effort
      }
    };

    // A Remote can never be the Speaker. When the server stops recognising this
    // tab as the Speaker, another device has taken over (rules A4 / C1). SSE
    // delivers that in ~1s; this needle tick is the fallback safety net.
    const yieldToNewSpeaker = (
      device: { deviceId: string; deviceName: string } | null
    ) => {
      usePlayerStore.getState().yieldSpeakerTo(device);
    };

    const sendPosition = async () => {
      const state = usePlayerStore.getState();
      const audio = audioRef.current;
      if (!audio || !state.currentTrack || state.playbackStatus !== "playing") return;
      // Only the Speaker owns the session's needle. A Remote's clock is a local
      // interpolation, so posting it would push a made-up position (rules B2/B8).
      if (selectIsRemote(useConnectStore.getState())) return;
      try {
        const res = await playerApi.sendSessionPosition({
          deviceId,
          instanceId,
          positionMs: Math.floor((audio.currentTime || 0) * 1000),
          isPlaying: true,
        });
        if (!cancelled && res && res.updated === false) {
          yieldToNewSpeaker(res.speaker ?? null);
        }
      } catch {
        // The next tick will retry
      }
    };

    void sendPresence();
    const presenceInterval = setInterval(sendPresence, 30_000);
    const positionInterval = setInterval(sendPosition, 10_000);

    // Releasing the Speaker role on unload is what makes a transfer clean
    // instead of waiting for a TTL (rule R7).
    const handlePageHide = () => {
      if (useConnectStore.getState().youAreSpeaker) {
        playerApi.leaveSpeakerBeacon(
          deviceId,
          instanceId,
          useAuthStore.getState().accessToken
        );
      }
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      cancelled = true;
      clearInterval(presenceInterval);
      clearInterval(positionInterval);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [isAuthenticated]);

  // 6. 30-Second Qualified Play Telemetry Tracker
  useEffect(() => {
    // Rule B8: telemetry is reported by the device that produced the sound.
    if (isRemote) return;
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
          countPlay: true,
        })
        .catch(() => {});
    }
  }, [currentTime, currentTrack, playbackStatus, isRemote]);

  // 7. Live Jam 3-Tier Adaptive Drift Corrector Loop for Listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const interval = setInterval(() => {
      const { activeRoom, isHost, clockOffsetMs, setSyncStatus } = useJamStore.getState();
      if (!activeRoom || isHost || activeRoom.playbackState !== "PLAYING") {
        if (audio.playbackRate !== 1.0) {
          audio.playbackRate = 1.0;
        }
        return;
      }

      if (audio.readyState < 2) return; // Wait until current media frame is available

      const nowServer = Date.now() + clockOffsetMs;
      const targetMs = activeRoom.anchorPositionMs + (nowServer - activeRoom.anchorServerTime);
      const currentMs = audio.currentTime * 1000;
      const driftMs = currentMs - targetMs;
      const absDrift = Math.abs(driftMs);

      if (absDrift < 50) {
        // Tier 1: In-Sync (< 50ms)
        if (audio.playbackRate !== 1.0) audio.playbackRate = 1.0;
        setSyncStatus("synced");
      } else if (absDrift <= 250) {
        // Tier 2: Micro-Slew Pitch-Preserved Rate (50ms - 250ms)
        audio.playbackRate = driftMs < 0 ? 1.03 : 0.97;
        setSyncStatus("drift_correcting");
      } else {
        // Tier 3: Hard Resync Seek (> 250ms)
        audio.currentTime = Math.max(0, targetMs / 1000);
        audio.playbackRate = 1.0;
        setSyncStatus("synced");
      }
    }, 400);

    return () => clearInterval(interval);
  }, []);

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
      /* A Remote's audio element is inert — it has no source, and the only
       * events it can still emit are echoes of the engine silencing itself.
       * Letting them write playback status would fight the mirrored session
       * (rule B2), so they stand down here just like the effects do. */
      onTimeUpdate={() => {
        if (isRemote) return;
        if (audioRef.current) {
          _setCurrentTime(audioRef.current.currentTime);
        }
      }}
      onLoadedMetadata={() => {
        if (isRemote) return;
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
        if (isRemote) return;
        if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
          _setDuration(audioRef.current.duration);
        }
      }}
      onWaiting={() => {
        if (isRemote) return;
        if (!isSourceChangingRef.current) {
          _setStatus("loading");
        }
      }}
      onPlay={() => {
        if (isRemote) return;
        isSourceChangingRef.current = false;
        useJamStore.getState().setNeedsGesture(false);
        markAudioUnlocked();
        _setStatus("playing");
      }}
      onPlaying={() => {
        if (isRemote) return;
        isSourceChangingRef.current = false;
        useJamStore.getState().setNeedsGesture(false);
        _setStatus("playing");
      }}
      onCanPlay={() => {
        if (isRemote) return;
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
      onPause={() => {
        // A Remote's mirrored status describes the *session*, so silencing this
        // inert element must not report a pause (rule B2).
        if (isRemote) return;
        // Ignore native pause events during media reset or source changing
        if (isSourceChangingRef.current) {
          return;
        }
        _setStatus("paused");
      }}
      onEnded={() => {
        if (isRemote) return;
        if (currentTrack) {
          const alreadyCounted = qualifiedReportedTrackIdRef.current === currentTrack.id;
          playerApi
            .sendTelemetry({
              songId: currentTrack.id,
              durationListenedSeconds: Math.floor(audioRef.current?.currentTime || 0),
              completed: true,
              countPlay: !alreadyCounted,
            })
            .catch(() => {});
        }

        const { activeRoom, isHost, jamQueue, removeFromJamQueue } = useJamStore.getState();
        if (activeRoom && isHost && jamQueue.length > 0) {
          // Advance Jam Queue
          const nextJamTrack = jamQueue[0];
          removeFromJamQueue(0);
          usePlayerStore.getState().playTrack({
            id: nextJamTrack.id,
            title: nextJamTrack.title,
            artistId: nextJamTrack.artistId || "",
            durationSeconds: nextJamTrack.duration,
            coverImageUrl: nextJamTrack.artworkUrl ?? undefined,
            artistName: nextJamTrack.artistName || "Unknown Artist",
            albumTitle: nextJamTrack.albumTitle ?? undefined,
            audioUrl: nextJamTrack.audioUrl ?? undefined,
            hlsManifestUrl: nextJamTrack.hlsManifestUrl ?? undefined,
            rawAudioKey: nextJamTrack.rawAudioKey ?? undefined,
          });
        } else {
          next();
        }
      }}
      onError={(e) => {
        if (isRemote) return;
        const audio = audioRef.current;
        const error = (e.target as HTMLAudioElement)?.error;
        console.warn(
          "[AudioEngine] Native HTML5 Audio error:",
          error?.code,
          error?.message,
          "Active source:",
          activeSourceTypeRef.current
        );

        // If HLS was being attempted (native HLS in Safari or HLS.js) and we haven't fallen back yet
        if (
          !isFallingBackRef.current &&
          fallbackUrlRef.current &&
          audio &&
          audio.src !== fallbackUrlRef.current &&
          (activeSourceTypeRef.current === "native-hls" || activeSourceTypeRef.current === "hls")
        ) {
          console.info(
            "[AudioEngine] 🔄 Native HTML5 audio error on HLS, falling back to direct MP3 audio:",
            fallbackUrlRef.current
          );
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          isFallingBackRef.current = true;
          activeSourceTypeRef.current = "direct";
          _setStreamFormat("progressive");

          const currentPos = audio.currentTime || pendingSeekTimeRef.current || 0;
          if (currentPos > 0) {
            pendingSeekTimeRef.current = currentPos;
          }
          audio.src = fallbackUrlRef.current;
          const targetStatus = usePlayerStore.getState().playbackStatus;
          if (targetStatus === "playing" || targetStatus === "loading") {
            audio.play().catch((err) => {
              if (err?.name === "AbortError") return;
              _setStatus("paused");
            });
          }
          return;
        }

        // Do not block UI if initial empty or unmounted
        if (currentTrack) {
          if (error?.code === 4 || error?.code === 3) {
            _setError(
              "Audio codec unsupported in this browser environment. For audio playback, please open Groovy in Chrome, Brave, Edge, or Firefox."
            );
          } else {
            _setError("Playback error: Audio stream unavailable");
          }
        }
      }}
    />
  );
}
