import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  parseAudioFilesWithPool,
  clusterTracksIntoReleases,
  type ClusteredRelease,
} from "../../lib/audio-metadata";
import {
  storageApi,
  type LockerQuota,
  type PersonalRelease,
  type PersonalTrack,
} from "../../lib/storage.api";
import { usePlayerStore } from "../../stores/player.store";
import type { PlayerTrack } from "../../types/player";
import { useLockerStore } from "../../stores/locker.store";
import { ProceduralCover } from "../common/ProceduralCover";
import {
  PlayIconSVG,
  PauseIconSVG,
  TrashIconSVG,
  UploadCloudSVG,
} from "../icons";

interface LockerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LockerImportModal: React.FC<LockerImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Navigation Tabs: "collection" (browse & manage) vs "import" (upload new tracks)
  const [activeTab, setActiveTab] = useState<"collection" | "import">("collection");

  // Collection State
  const [personalReleases, setPersonalReleases] = useState<PersonalRelease[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [expandedReleaseIds, setExpandedReleaseIds] = useState<Set<string>>(new Set());

  // Quota State
  const [quota, setQuota] = useState<LockerQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  // Deletion State
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "song" | "release";
    id: string;
    title: string;
    parentReleaseId?: string;
    trackCount?: number;
  } | null>(null);

  // Import State
  const [isParsing, setIsParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState({ current: 0, total: 0 });
  const [importReleases, setImportReleases] = useState<ClusteredRelease[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Audio Player Store
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const triggerRefresh = useLockerStore((s) => s.triggerRefresh);

  // Load quota and personal releases when modal opens
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
      setErrorMessage(null);
      setSuccessMessage(null);
    } else {
      setImportReleases([]);
      setIsUploading(false);
      setUploadProgress(0);
      setDeleteConfirm(null);
      setDeletingItemId(null);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isUploading, onClose]);

  const loadInitialData = async () => {
    await Promise.all([loadQuota(), loadCollection()]);
  };

  const loadQuota = async () => {
    try {
      setQuotaLoading(true);
      const res = await storageApi.getQuota();
      setQuota(res.quota);
    } catch (err: any) {
      console.error("Failed to load personal collection quota:", err);
    } finally {
      setQuotaLoading(false);
    }
  };

  const loadCollection = async () => {
    try {
      setIsLoadingReleases(true);
      const res = await storageApi.getPersonalReleases();
      const releases = res.releases || [];
      setPersonalReleases(releases);

      // Default to collection tab if user already has releases, else import tab
      if (releases.length === 0) {
        setActiveTab("import");
      } else {
        setActiveTab("collection");
        if (releases.length > 0) {
          setExpandedReleaseIds(new Set([releases[0].id]));
        }
      }
    } catch (err: any) {
      console.error("Failed to load personal collection releases:", err);
    } finally {
      setIsLoadingReleases(false);
    }
  };

  const toggleExpandRelease = (releaseId: string) => {
    setExpandedReleaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(releaseId)) {
        next.delete(releaseId);
      } else {
        next.add(releaseId);
      }
      return next;
    });
  };

  // Play a personal track within player context
  const handlePlayPersonalTrack = (
    release: PersonalRelease,
    track: PersonalTrack,
    trackIdx: number
  ) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
      return;
    }

    const contextTracks: PlayerTrack[] = release.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artistId: release.artistId || "",
      artistName: t.artistName || release.artistName || "Personal Artist",
      artistSlug: release.artistSlug,
      albumTitle: release.title,
      coverImageUrl: t.coverImageUrl || release.coverImageUrl || undefined,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      hlsManifestUrl: t.hlsManifestUrl,
      rawAudioKey: t.rawAudioKey,
      isExplicit: t.isExplicit ?? false,
    }));

    playTrack(
      contextTracks[trackIdx],
      contextTracks,
      trackIdx,
      `personal:release:${release.id}`,
      `Personal Collection: ${release.title}`
    );
  };

  // Execute Song Deletion
  const confirmDeleteSong = async (songId: string, parentReleaseId: string) => {
    try {
      setDeletingItemId(songId);
      setErrorMessage(null);
      await storageApi.deletePersonalSong(songId);

      // Optimistically update collection state
      setPersonalReleases((prev) => {
        return prev
          .map((rel) => {
            if (rel.id !== parentReleaseId) return rel;
            const updatedTracks = rel.tracks.filter((t) => t.id !== songId);
            return {
              ...rel,
              totalTracks: updatedTracks.length,
              totalDurationSeconds: updatedTracks.reduce((acc, t) => acc + t.durationSeconds, 0),
              tracks: updatedTracks,
            };
          })
          .filter((rel) => rel.tracks.length > 0);
      });

      // Update quota locally
      setQuota((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          usedSongs: Math.max(0, prev.usedSongs - 1),
          remainingSongs: Math.min(prev.maxSongs, prev.remainingSongs + 1),
        };
      });

      triggerRefresh();
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error("Failed to delete personal track:", err);
      setErrorMessage(err.message || "Failed to delete track");
    } finally {
      setDeletingItemId(null);
    }
  };

  // Execute Release Deletion
  const confirmDeleteRelease = async (releaseId: string) => {
    try {
      setDeletingItemId(releaseId);
      setErrorMessage(null);
      const res = await storageApi.deletePersonalRelease(releaseId);

      const deletedCount = res.deletedTracks ?? 1;

      // Optimistically remove release
      setPersonalReleases((prev) => prev.filter((r) => r.id !== releaseId));

      // Update quota locally
      setQuota((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          usedSongs: Math.max(0, prev.usedSongs - deletedCount),
          remainingSongs: Math.min(prev.maxSongs, prev.remainingSongs + deletedCount),
        };
      });

      triggerRefresh();
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error("Failed to delete personal release:", err);
      setErrorMessage(err.message || "Failed to delete release");
    } finally {
      setDeletingItemId(null);
    }
  };

  // Process dropped or selected files for import
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) =>
      /\.(mp3|flac|wav|m4a|aac|ogg)$/i.test(f.name)
    );

    if (files.length === 0) {
      setErrorMessage("No supported audio files found (.mp3, .flac, .wav, .m4a, .aac, .ogg)");
      return;
    }

    setErrorMessage(null);
    setIsParsing(true);
    setParsingProgress({ current: 0, total: files.length });

    try {
      // Concurrently parse files with a bounded pool of 6 workers
      const parsedTracks = await parseAudioFilesWithPool(files, 6, (current, total) => {
        setParsingProgress({ current, total });
      });

      const clustered = clusterTracksIntoReleases(parsedTracks);
      setImportReleases((prev) => [...prev, ...clustered]);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to parse audio tags");
    } finally {
      setIsParsing(false);
    }
  };

  const totalSelectedTracks = importReleases.reduce((acc, r) => acc + r.tracks.length, 0);
  const isOverQuota = quota ? totalSelectedTracks > quota.remainingSongs : false;

  // Execute Direct R2 Uploads + Bulk Release Registration
  const handleStartImport = async () => {
    if (importReleases.length === 0 || isOverQuota) return;

    setIsUploading(true);
    setErrorMessage(null);
    setUploadProgress(0);

    try {
      // 1. Prepare batch presigned URL requests
      setUploadStatusText("Requesting presigned upload URLs...");
      const presignedBatch = [];

      for (const release of importReleases) {
        for (const track of release.tracks) {
          const ext = track.file.name.split(".").pop()?.toLowerCase() || "mp3";
          const mime = track.file.type || (ext === "flac" ? "audio/flac" : "audio/mpeg");
          presignedBatch.push({
            clientFileId: track.id,
            category: "SONG_AUDIO_RAW" as const,
            resourceId: track.id,
            mimeType: mime,
            fileExtension: ext,
            fileSizeBytes: track.file.size,
          });
        }
        if (release.coverFile) {
          const cExt = release.coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
          presignedBatch.push({
            clientFileId: release.id,
            category: "ALBUM_COVER" as const,
            resourceId: release.id,
            mimeType: release.coverFile.type || "image/jpeg",
            fileExtension: cExt,
            fileSizeBytes: release.coverFile.size,
          });
        }
      }

      const { uploads } = await storageApi.getBatchPresignedUrls(presignedBatch);
      const uploadMap = new Map(uploads.map((u) => [u.clientFileId, u]));

      // 2. Upload files directly to Cloudflare R2 in concurrency of 3
      setUploadStatusText("Uploading media directly to storage...");
      const totalUploadsCount = presignedBatch.length;
      let completedCount = 0;

      const uploadQueue = [];
      for (const release of importReleases) {
        for (const track of release.tracks) {
          const urlInfo = uploadMap.get(track.id);
          if (urlInfo) {
            uploadQueue.push(async () => {
              await storageApi.uploadFileToR2(urlInfo.uploadUrl, track.file, track.file.type);
              completedCount++;
              setUploadProgress(Math.round((completedCount / totalUploadsCount) * 80));
            });
          }
        }
        if (release.coverFile) {
          const coverUrlInfo = uploadMap.get(release.id);
          if (coverUrlInfo) {
            uploadQueue.push(async () => {
              await storageApi.uploadFileToR2(
                coverUrlInfo.uploadUrl,
                release.coverFile!,
                release.coverFile!.type
              );
              completedCount++;
              setUploadProgress(Math.round((completedCount / totalUploadsCount) * 80));
            });
          }
        }
      }

      for (let i = 0; i < uploadQueue.length; i += 3) {
        const batch = uploadQueue.slice(i, i + 3).map((fn) => fn());
        await Promise.all(batch);
      }

      // 3. Register releases and outbox events in database
      setUploadStatusText("Registering releases & creating personal catalog...");
      setUploadProgress(85);

      for (let i = 0; i < importReleases.length; i++) {
        const release = importReleases[i];
        const coverUrlInfo = uploadMap.get(release.id);

        const tracksPayload = release.tracks.map((track) => {
          const songUrlInfo = uploadMap.get(track.id);
          return {
            title: track.title,
            trackNumber: track.trackNumber,
            discNumber: track.discNumber,
            durationSeconds: track.durationSeconds,
            genre: track.genre || release.genre || null,
            isExplicit: track.isExplicit,
            rawAudioKey: songUrlInfo?.storageKey || "",
            artistName: track.artistName !== release.artistName ? track.artistName : null,
          };
        });

        await storageApi.bulkImportRelease({
          artistName: release.artistName,
          albumTitle: release.albumTitle,
          albumType: release.albumType,
          genre: release.genre,
          releaseDate: release.releaseDate,
          coverImageUrl: coverUrlInfo?.publicUrl || null,
          tracks: tracksPayload,
        });

        setUploadProgress(85 + Math.round(((i + 1) / importReleases.length) * 15));
      }

      setUploadStatusText("Import complete!");
      setUploadProgress(100);

      // Clear imported files
      setImportReleases([]);
      setIsUploading(false);

      // Refresh collection and quota, trigger global refresh, and switch to collection tab
      await loadInitialData();
      triggerRefresh();
      onSuccess?.();
      setActiveTab("collection");
      setSuccessMessage("Music imported successfully into your Personal Collection!");
    } catch (err: any) {
      console.error("Personal collection import failed:", err);
      setErrorMessage(err.message || "Failed to complete import");
      setIsUploading(false);
    }
  };

  // Filtered personal releases based on search query
  const filteredReleases = useMemo(() => {
    if (!collectionSearch.trim()) return personalReleases;
    const query = collectionSearch.toLowerCase().trim();

    return personalReleases.filter((r) => {
      const matchAlbum = r.title.toLowerCase().includes(query);
      const matchArtist = r.artistName.toLowerCase().includes(query);
      const matchTrack = r.tracks.some((t) => t.title.toLowerCase().includes(query));
      return matchAlbum || matchArtist || matchTrack;
    });
  }, [personalReleases, collectionSearch]);

  const totalPersonalSongs = useMemo(() => {
    return personalReleases.reduce((acc, r) => acc + (r.tracks?.length || 0), 0);
  }, [personalReleases]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop overlay matching Groovy standard */}
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-in fade-in duration-150 cursor-pointer"
        onClick={isUploading ? undefined : onClose}
      />

      {/* Modal Dialog Card */}
      <div
        className="relative w-full max-w-4xl max-h-[85vh] border border-line bg-canvas shadow-[0_24px_80px_rgba(23,22,15,0.20)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-150 rounded-xs overflow-hidden flex flex-col z-10 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top rule / Subtitle */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3 sm:px-7 bg-canvas">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft">
              Library / Personal Collection
            </span>
            <span className="font-mono text-[8.5px] uppercase tracking-wider px-2 py-0.5 border border-line bg-panel text-blue font-semibold">
              Private Vault
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close"
            className="group flex h-7 w-7 items-center justify-center text-ink-soft transition hover:text-ink cursor-pointer"
          >
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
        </div>

        {/* Brand & Quota Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-line bg-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 id="collection-dialog-title" className="font-serif italic text-2xl text-ink font-normal">
              Personal Collection
            </h2>
            <p className="font-sans text-xs text-ink-soft mt-0.5 leading-relaxed">
              Privately upload &amp; stream your offline collection across devices &bull; Never visible to other curators.
            </p>
          </div>

          {quotaLoading ? (
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-soft animate-pulse">
              Checking quota...
            </div>
          ) : quota ? (
            <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                Storage Quota:{' '}
                <strong className="text-ink font-bold font-mono">
                  {quota.usedSongs}
                </strong>{' '}
                / {quota.maxSongs} Songs
                <span
                  className={`ml-1.5 ${
                    quota.remainingSongs === 0
                      ? 'text-red-500 font-semibold'
                      : 'text-blue font-semibold'
                  }`}
                >
                  ({quota.remainingSongs} slots left)
                </span>
              </div>
              <div className="w-44 h-1.5 bg-canvas border border-line overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    quota.usedSongs >= quota.maxSongs ? "bg-red-500" : "bg-ink"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((quota.usedSongs / quota.maxSongs) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Filter / Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-line px-5 sm:px-7 py-2.5 bg-canvas-deep/40 font-mono text-[10px] uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("collection")}
              className={`px-3 py-1.5 border transition-all cursor-pointer ${
                activeTab === "collection"
                  ? "bg-ink text-canvas border-ink font-semibold"
                  : "bg-panel text-ink-soft border-line hover:text-ink hover:border-ink/50"
              }`}
            >
              My Collection ({totalPersonalSongs})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("import")}
              className={`px-3 py-1.5 border transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "import"
                  ? "bg-ink text-canvas border-ink font-semibold"
                  : "bg-panel text-ink-soft border-line hover:text-ink hover:border-ink/50"
              }`}
            >
              <span>+ Import Music</span>
              {importReleases.length > 0 && (
                <span className="font-bold font-mono">({totalSelectedTracks})</span>
              )}
            </button>
          </div>

          {activeTab === "collection" && personalReleases.length > 0 && (
            <div className="font-mono text-[9px] text-ink-soft uppercase tracking-[0.14em] hidden sm:block">
              {personalReleases.length} {personalReleases.length === 1 ? 'Release' : 'Releases'}
            </div>
          )}
        </div>

        {/* Notifications / Alerts */}
        {errorMessage && (
          <div className="mx-5 sm:mx-7 mt-3 p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-mono text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-700 dark:text-red-300 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mx-5 sm:mx-7 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-800 dark:text-emerald-200 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Deletion Confirmation Modal Overlay */}
        {deleteConfirm && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md border border-line bg-canvas p-6 shadow-2xl space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 border border-line bg-panel flex items-center justify-center text-red-500 shrink-0">
                  <TrashIconSVG className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif italic text-lg text-ink font-normal">
                    {deleteConfirm.type === "song" ? "Delete Personal Track?" : "Delete Personal Release?"}
                  </h4>
                  <p className="font-sans text-xs text-ink-soft mt-1 leading-relaxed">
                    Are you sure you want to remove{" "}
                    <strong className="text-ink font-semibold">"{deleteConfirm.title}"</strong> from your
                    personal collection?
                    {deleteConfirm.type === "release" && (
                      <span className="block text-ink font-medium mt-1">
                        This will permanently delete all {deleteConfirm.trackCount || 1} track(s) and immediately free {deleteConfirm.trackCount || 1} quota slot(s).
                      </span>
                    )}
                    {deleteConfirm.type === "song" && (
                      <span className="block text-ink font-medium mt-1">
                        This will immediately free 1 quota slot.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={deletingItemId !== null}
                  onClick={() => setDeleteConfirm(null)}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-3 border border-line text-ink-soft hover:text-ink hover:border-ink bg-panel transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingItemId !== null}
                  onClick={() => {
                    if (deleteConfirm.type === "song") {
                      confirmDeleteSong(deleteConfirm.id, deleteConfirm.parentReleaseId!);
                    } else {
                      confirmDeleteRelease(deleteConfirm.id);
                    }
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {deletingItemId !== null ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {/* ==================== TAB 1: MY COLLECTION ==================== */}
          {activeTab === "collection" && (
            <div className="space-y-4">
              {/* Search & Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <input
                    type="text"
                    placeholder="Filter songs, artists, releases..."
                    value={collectionSearch}
                    onChange={(e) => setCollectionSearch(e.target.value)}
                    className="w-full pl-8 pr-6 py-1.5 border border-line bg-panel text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink transition-colors font-sans"
                  />
                  <span className="absolute left-2.5 top-2 text-ink-soft text-xs">🔍</span>
                  {collectionSearch && (
                    <button
                      onClick={() => setCollectionSearch("")}
                      className="absolute right-2 top-1.5 text-ink-soft hover:text-ink text-xs cursor-pointer font-mono"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("import")}
                  className="self-start sm:self-auto font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line text-ink-soft hover:text-ink hover:border-ink bg-panel transition-colors cursor-pointer"
                >
                  + Import More Music
                </button>
              </div>

              {/* Releases Content */}
              {isLoadingReleases ? (
                <div className="py-16 text-center font-mono text-xs uppercase tracking-[0.14em] text-ink-soft animate-pulse">
                  Loading personal collection...
                </div>
              ) : personalReleases.length === 0 ? (
                /* Empty Collection State */
                <div className="p-8 border border-dashed border-line bg-canvas-deep/20 text-center space-y-3 my-2">
                  <div className="w-12 h-12 bg-panel border border-line text-blue flex items-center justify-center mx-auto text-xl">
                    <UploadCloudSVG className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif italic text-lg text-ink font-normal">
                      Your Personal Collection is Empty
                    </h3>
                    <p className="font-sans text-xs text-ink-soft max-w-md mx-auto mt-1 leading-relaxed">
                      Upload your offline MP3, FLAC, WAV, or AAC files. They will be stored securely
                      in your private lossless vault with full metadata tags.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("import")}
                    className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity font-semibold cursor-pointer inline-flex items-center gap-2"
                  >
                    <UploadCloudSVG className="w-3.5 h-3.5" />
                    <span>Start Importing Music</span>
                  </button>
                </div>
              ) : filteredReleases.length === 0 ? (
                <div className="p-8 text-center text-ink-soft text-xs font-mono">
                  No releases match "{collectionSearch}".
                </div>
              ) : (
                /* Releases Cards List */
                <div className="space-y-3">
                  {filteredReleases.map((release) => {
                    const isExpanded = expandedReleaseIds.has(release.id);
                    const isDeletingRelease = deletingItemId === release.id;

                    return (
                      <div
                        key={release.id}
                        className="border border-line bg-panel shadow-2xs overflow-hidden transition-all"
                      >
                        {/* Release Header */}
                        <div className="p-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            {/* Artwork Cover */}
                            <div className="w-12 h-12 bg-canvas border border-line shrink-0 overflow-hidden relative">
                              {release.coverImageUrl ? (
                                <img
                                  src={release.coverImageUrl}
                                  alt={release.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ProceduralCover
                                  size="sm"
                                  title={release.title}
                                  artistName={release.artistName}
                                  className="w-full h-full rounded-none"
                                />
                              )}
                            </div>

                            {/* Release Title & Artist */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-serif italic text-base text-ink font-medium truncate">
                                  {release.title}
                                </h4>
                                <span className="font-mono text-[8px] uppercase tracking-wider text-blue bg-blue/10 border border-blue/20 px-1.5 py-0.2 font-semibold">
                                  {release.albumType || "Album"}
                                </span>
                              </div>
                              <p className="font-sans text-xs text-ink-soft truncate mt-0.5">
                                {release.artistName} &bull; {release.totalTracks}{" "}
                                {release.totalTracks === 1 ? "track" : "tracks"} &bull;{" "}
                                {Math.floor(release.totalDurationSeconds / 60)}m{" "}
                                {release.totalDurationSeconds % 60}s
                              </p>
                            </div>
                          </div>

                          {/* Action Controls */}
                          <div className="flex items-center gap-2 shrink-0">
                            {release.tracks?.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handlePlayPersonalTrack(release, release.tracks[0], 0)}
                                className="w-7 h-7 border border-line bg-canvas hover:bg-panel flex items-center justify-center text-ink transition-colors cursor-pointer"
                                title="Play Release"
                              >
                                <PlayIconSVG className="w-3.5 h-3.5 ml-0.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleExpandRelease(release.id)}
                              className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1 border border-line bg-canvas hover:bg-panel text-ink transition-colors cursor-pointer"
                            >
                              {isExpanded ? "Hide" : "Tracks"}
                            </button>

                            <button
                              type="button"
                              disabled={isDeletingRelease}
                              onClick={() =>
                                setDeleteConfirm({
                                  type: "release",
                                  id: release.id,
                                  title: release.title,
                                  trackCount: release.totalTracks,
                                })
                              }
                              className="w-7 h-7 border border-line bg-canvas hover:border-red-400 hover:text-red-500 text-ink-soft flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete Release from Personal Collection"
                            >
                              {isDeletingRelease ? (
                                <div className="w-2.5 h-2.5 border border-red-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <TrashIconSVG className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Tracks List */}
                        {isExpanded && release.tracks && (
                          <div className="border-t border-line divide-y divide-line/60 bg-canvas-deep/20 text-xs">
                            {release.tracks.map((track, tIdx) => {
                              const isPlayingThis =
                                currentTrack?.id === track.id && playbackStatus === "playing";
                              const isDeletingTrack = deletingItemId === track.id;

                              return (
                                <div
                                  key={track.id}
                                  className={`py-2 px-4 flex items-center justify-between gap-3 hover:bg-canvas transition-colors ${
                                    currentTrack?.id === track.id ? "bg-panel" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePlayPersonalTrack(release, track, tIdx)
                                      }
                                      className="w-6 h-6 border border-line flex items-center justify-center font-mono text-[10px] text-ink-soft hover:border-ink hover:text-ink transition-colors cursor-pointer bg-panel shrink-0"
                                      title={isPlayingThis ? "Pause" : "Play track"}
                                    >
                                      {isPlayingThis ? (
                                        <PauseIconSVG className="w-2.5 h-2.5" />
                                      ) : (
                                        <PlayIconSVG className="w-2.5 h-2.5 ml-0.2" />
                                      )}
                                    </button>

                                    <span className="font-mono text-[10px] text-ink-soft w-4 text-right">
                                      {track.trackNumber || tIdx + 1}
                                    </span>

                                    <div className="min-w-0 flex-1 flex items-center gap-2">
                                      <span className="font-serif italic text-xs text-ink truncate">
                                        {track.title}
                                      </span>
                                      {track.artistName && track.artistName !== release.artistName && (
                                        <span className="font-sans text-ink-soft text-[11px] truncate">
                                          ({track.artistName})
                                        </span>
                                      )}
                                      {track.processingStatus === "PROCESSING" && (
                                        <span className="font-mono text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 animate-pulse">
                                          Transcoding
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono text-[10px] text-ink-soft">
                                      {Math.floor(track.durationSeconds / 60)}:
                                      {(track.durationSeconds % 60).toString().padStart(2, "0")}
                                    </span>

                                    <button
                                      type="button"
                                      disabled={isDeletingTrack}
                                      onClick={() =>
                                        setDeleteConfirm({
                                          type: "song",
                                          id: track.id,
                                          title: track.title,
                                          parentReleaseId: release.id,
                                        })
                                      }
                                      className="p-1 text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                                      title="Delete Track from Personal Collection"
                                    >
                                      {isDeletingTrack ? (
                                        <div className="w-2.5 h-2.5 border border-red-500 border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <TrashIconSVG className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: IMPORT MUSIC ==================== */}
          {activeTab === "import" && (
            <div className="space-y-5">
              {/* Parsing progress indicator */}
              {isParsing && (
                <div className="p-3.5 bg-canvas border border-line text-xs text-ink flex items-center gap-3 font-mono">
                  <div className="w-4 h-4 border-2 border-line-soft border-t-ink rounded-full animate-spin" />
                  <span>
                    Extracting ID3 tags, duration &amp; artwork in browser ({parsingProgress.current} /{" "}
                    {parsingProgress.total} files)...
                  </span>
                </div>
              )}

              {/* Upload Progress Indicator */}
              {isUploading && (
                <div className="p-4 border border-line bg-panel space-y-2">
                  <div className="flex justify-between font-mono text-[10.5px] uppercase tracking-wider text-ink">
                    <span>{uploadStatusText}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-canvas border border-line overflow-hidden">
                    <div
                      className="h-full bg-ink transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Review Desk / Release List */}
              {importReleases.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                      Import Review Desk ({importReleases.length} Release(s), {totalSelectedTracks}{" "}
                      Track(s))
                    </h3>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
                    >
                      + Add More Files
                    </button>
                  </div>

                  {importReleases.map((release, relIdx) => (
                    <div
                      key={release.id}
                      className="border border-line bg-panel p-4 space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start gap-4">
                        {/* Cover Art Preview */}
                        <div className="w-16 h-16 bg-canvas border border-line shrink-0 overflow-hidden relative">
                          {release.coverPreviewUrl ? (
                            <img
                              src={release.coverPreviewUrl}
                              alt={release.albumTitle}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ProceduralCover
                              title={release.albumTitle}
                              artistName={release.artistName}
                              size="md"
                              className="w-full h-full rounded-none"
                            />
                          )}
                        </div>

                        {/* Release metadata editor */}
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block mb-1">
                              Album Title
                            </label>
                            <input
                              type="text"
                              value={release.albumTitle}
                              disabled={isUploading}
                              onChange={(e) => {
                                const val = e.target.value;
                                setImportReleases((prev) =>
                                  prev.map((r, i) =>
                                    i === relIdx ? { ...r, albumTitle: val } : r
                                  )
                                );
                              }}
                              className="w-full px-2.5 py-1.5 border border-line bg-canvas text-ink text-xs focus:outline-none focus:border-ink transition-colors font-sans"
                            />
                          </div>

                          <div>
                            <label className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block mb-1">
                              Artist Name
                            </label>
                            <input
                              type="text"
                              value={release.artistName}
                              disabled={isUploading}
                              onChange={(e) => {
                                const val = e.target.value;
                                setImportReleases((prev) =>
                                  prev.map((r, i) =>
                                    i === relIdx ? { ...r, artistName: val } : r
                                  )
                                );
                              }}
                              className="w-full px-2.5 py-1.5 border border-line bg-canvas text-ink text-xs focus:outline-none focus:border-ink transition-colors font-sans"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block mb-1">
                                Release Type
                              </label>
                              <select
                                value={release.albumType}
                                disabled={isUploading}
                                onChange={(e) => {
                                  const val = e.target.value as any;
                                  setImportReleases((prev) =>
                                    prev.map((r, i) =>
                                      i === relIdx ? { ...r, albumType: val } : r
                                    )
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 border border-line bg-canvas text-ink text-xs focus:outline-none focus:border-ink transition-colors font-sans"
                              >
                                <option value="ALBUM">Album</option>
                                <option value="EP">EP</option>
                                <option value="SINGLE">Single</option>
                              </select>
                            </div>

                            <button
                              onClick={() => {
                                setImportReleases((prev) => prev.filter((_, i) => i !== relIdx));
                              }}
                              disabled={isUploading}
                              className="mt-4 p-1.5 text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                              title="Remove release from import"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Tracks list */}
                      <div className="border border-line/60 bg-canvas-deep/20 divide-y divide-line/40 p-2 text-xs">
                        {release.tracks.map((track) => (
                          <div
                            key={track.id}
                            className="py-1.5 px-2 flex items-center justify-between hover:bg-canvas transition-colors"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="font-mono text-[10px] text-ink-soft w-4 text-right">
                                {track.trackNumber}
                              </span>
                              <span className="font-serif italic text-xs text-ink truncate">
                                {track.title}
                              </span>
                              {track.artistName !== release.artistName && (
                                <span className="font-sans text-ink-soft text-[11px] truncate">
                                  ({track.artistName})
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-ink-soft shrink-0">
                              {Math.floor(track.durationSeconds / 60)}:
                              {(track.durationSeconds % 60).toString().padStart(2, "0")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty Drop Zone */
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  className="border-2 border-dashed border-line bg-canvas-deep/20 p-10 text-center space-y-3"
                >
                  <div className="w-12 h-12 bg-panel border border-line text-blue flex items-center justify-center mx-auto text-xl">
                    <UploadCloudSVG className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif italic text-lg text-ink font-normal">
                      Drop audio files or folders here
                    </h3>
                    <p className="font-sans text-xs text-ink-soft max-w-md mx-auto mt-1 leading-relaxed">
                      Supports MP3, FLAC, WAV, AAC, M4A, OGG. Tags and embedded cover art are extracted
                      in-browser and clustered into releases automatically.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity font-semibold cursor-pointer"
                    >
                      Choose Files
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-4 border border-line text-ink hover:border-ink bg-panel transition-colors cursor-pointer"
                    >
                      Choose Folder
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden File Inputs */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".mp3,.flac,.wav,.m4a,.aac,.ogg,audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-ignore
                webkitdirectory="true"
                directory="true"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </div>

        {/* Footer (active when on import tab with files ready) */}
        {activeTab === "import" && (
          <div className="flex items-center justify-between px-5 sm:px-7 py-3 border-t border-line bg-canvas">
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
              {importReleases.length > 0 && (
                <span>
                  Total: <strong className="text-ink font-bold">{totalSelectedTracks}</strong> track(s) ready
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (personalReleases.length > 0) {
                    setActiveTab("collection");
                  } else {
                    onClose();
                  }
                }}
                disabled={isUploading}
                className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-4 border border-line text-ink-soft hover:text-ink hover:border-ink bg-panel transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartImport}
                disabled={importReleases.length === 0 || isUploading || isOverQuota}
                className={`font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 font-semibold transition-all cursor-pointer ${
                  importReleases.length === 0 || isUploading || isOverQuota
                    ? "bg-canvas-deep text-ink-soft/50 border border-line cursor-not-allowed"
                    : "bg-ink text-canvas hover:opacity-90 shadow-xs"
                }`}
              >
                {isUploading
                  ? "Importing..."
                  : isOverQuota
                  ? "Quota Exceeded"
                  : `Import ${totalSelectedTracks} Track${
                      totalSelectedTracks === 1 ? "" : "s"
                    } to Collection`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
