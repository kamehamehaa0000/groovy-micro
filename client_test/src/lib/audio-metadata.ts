import { parseBlob } from "music-metadata";

export interface ParsedTrack {
  id: string; // client unique ID
  file: File;
  title: string;
  artistName: string;
  albumArtist?: string;
  albumTitle: string;
  hasAlbumTag: boolean;
  trackNumber: number;
  discNumber: number;
  durationSeconds: number;
  genre: string | null;
  isExplicit: boolean;
  coverFile: File | null;
  coverPreviewUrl: string | null;
}

export interface ClusteredRelease {
  id: string; // client unique ID
  artistName: string;
  albumTitle: string;
  albumType: "ALBUM" | "EP" | "SINGLE" | "MIXTAPE" | "LP";
  genre: string | null;
  releaseDate: string;
  coverFile: File | null;
  coverPreviewUrl: string | null;
  tracks: ParsedTrack[];
  targetExistingAlbumId?: string;
}

/**
 * Derives a standard audio MIME type from file extension if file.type is blank or generic.
 */
function getAudioMimeType(filename: string, browserType?: string): string {
  if (browserType && browserType.startsWith("audio/") && browserType !== "audio/octet-stream") {
    return browserType;
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "flac":
      return "audio/flac";
    case "wav":
    case "wave":
      return "audio/wav";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "wma":
      return "audio/x-ms-wma";
    default:
      return browserType || "audio/mpeg";
  }
}

/**
 * Intelligent filename parser for extracting Title and Artist when tags are incomplete.
 * e.g. "01 - Pink Floyd - Time.mp3" -> { artistName: "Pink Floyd", title: "Time" }
 * e.g. "Queen - Bohemian Rhapsody.mp3" -> { artistName: "Queen", title: "Bohemian Rhapsody" }
 */
function parseFilenameHeuristics(filename: string): { title: string; artistName?: string } {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  // Strip leading track numbers like "01.", "01 -", "1. "
  const stripped = nameWithoutExt.replace(/^(\d+[\s.-]+)/, "").trim();

  // Check if filename is in "Artist - Title" format
  const parts = stripped.split(/\s+-\s+/);
  if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
    return {
      artistName: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim(),
    };
  }

  return { title: stripped || nameWithoutExt };
}

/**
 * Native Browser HTML5 Audio duration measurement fallback.
 * Uses browser's native audio decoder to get exact duration in seconds.
 */
function getAudioDurationFromElement(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.URL) {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";

    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      URL.revokeObjectURL(url);
    };

    audio.onloadedmetadata = () => {
      const dur = Math.round(audio.duration || 0);
      cleanup();
      resolve(isFinite(dur) && dur > 0 ? dur : 0);
    };

    audio.onerror = () => {
      cleanup();
      resolve(0);
    };

    audio.src = url;
  });
}

/**
 * Parses a single audio file in-browser using modern music-metadata parseBlob(),
 * extracting ID3/Vorbis/MP4 tags, embedded artwork, and exact audio duration.
 */
export async function parseAudioFile(file: File): Promise<ParsedTrack> {
  const id = `track_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
  const filenameMeta = parseFilenameHeuristics(file.name);
  const mimeType = getAudioMimeType(file.name, file.type);

  // In parallel, measure duration with browser's native audio decoder
  const nativeDurationPromise = getAudioDurationFromElement(file);

  let coverFile: File | null = null;
  let coverPreviewUrl: string | null = null;
  let tagTitle = "";
  let tagArtist = "";
  let tagAlbumArtist = "";
  let tagAlbum = "";
  let tagTrackNo = 1;
  let tagDiscNo = 1;
  let tagGenre: string | null = null;
  let tagDuration = 0;

  try {
    // Ensure the Blob has a valid audio MIME type so parseBlob's BlobTokenizer
    // sets the correct Content-Type without guessing or failing on Windows empty MIME types
    const blobToParse: Blob =
      file.type && file.type.startsWith("audio/") && file.type !== "audio/octet-stream"
        ? file
        : new Blob([file], { type: mimeType });

    const metadata = await parseBlob(blobToParse, {
      duration: true,
      skipCovers: false,
    });

    const { common, format } = metadata;

    // 1. Embedded Artwork Extraction
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      const picMime = pic.format || "image/jpeg";
      const ext = picMime.includes("png") ? "png" : "jpg";
      const uint8 = new Uint8Array(pic.data);
      const blob = new Blob([uint8], { type: picMime });
      coverFile = new File([blob], `embedded_cover_${id}.${ext}`, { type: picMime });
      coverPreviewUrl = URL.createObjectURL(blob);
    }

    // 2. Metadata Tags
    tagTitle = common.title?.trim() || "";
    tagArtist =
      common.artist?.trim() ||
      common.albumartist?.trim() ||
      common.artists?.[0]?.trim() ||
      "";
    tagAlbumArtist = common.albumartist?.trim() || "";
    tagAlbum = common.album?.trim() || "";
    tagTrackNo = common.track?.no || 1;
    tagDiscNo = common.disk?.no || 1;
    tagGenre = common.genre?.[0]?.trim() || null;
    tagDuration = Math.round(format.duration || 0);
  } catch (err) {
    console.warn(`[AudioParser] parseBlob warning for ${file.name}:`, err);
  }

  // 3. Resolve duration: use tag duration if available, else native HTML5 audio measurement
  const nativeDuration = await nativeDurationPromise;
  const durationSeconds = tagDuration > 0 ? tagDuration : nativeDuration;

  // 4. Resolve Title & Artist: prioritize valid tags, then filename heuristics
  const title = tagTitle || filenameMeta.title || file.name.replace(/\.[^/.]+$/, "");
  const artistName = tagArtist || filenameMeta.artistName || "Unknown Artist";
  const albumTitle = tagAlbum || title;
  const hasAlbumTag = Boolean(tagAlbum && tagAlbum.trim().length > 0);
  const albumArtist = tagAlbumArtist || undefined;

  return {
    id,
    file,
    title,
    artistName,
    albumArtist,
    albumTitle,
    hasAlbumTag,
    trackNumber: tagTrackNo,
    discNumber: tagDiscNo,
    durationSeconds,
    genre: tagGenre,
    isExplicit: false,
    coverFile,
    coverPreviewUrl,
  };
}

/**
 * Concurrently parses an array of audio files using a worker pool of bounded size (default: 6).
 * Keeps memory bounded while achieving ~4-8x speedups for large collections (500–5,000 tracks).
 */
export async function parseAudioFilesWithPool(
  files: File[],
  concurrency = 6,
  onProgress?: (completed: number, total: number) => void
): Promise<ParsedTrack[]> {
  const results: ParsedTrack[] = [];
  let index = 0;
  let completed = 0;

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (index < files.length) {
      const currentIndex = index++;
      const file = files[currentIndex];
      const parsed = await parseAudioFile(file);
      results[currentIndex] = parsed;
      completed++;
      if (onProgress) {
        onProgress(completed, files.length);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Clusters a list of parsed tracks into structured releases (Album, EP, or Single).
 * If files have an exact matching non-empty album name, they are placed in the exact same release.
 */
export function clusterTracksIntoReleases(tracks: ParsedTrack[]): ClusteredRelease[] {
  const clusters = new Map<string, ParsedTrack[]>();

  for (const track of tracks) {
    const rawAlbum = (track.albumTitle || "").trim();
    const normAlbum = rawAlbum.toLowerCase();
    const normArtist = (track.artistName || "Unknown Artist").toLowerCase().trim();

    // If tracks have an explicit album tag and it's not generic, cluster strictly by album name!
    const clusterKey =
      track.hasAlbumTag && normAlbum && normAlbum !== "untitled album" && normAlbum !== "untitled"
        ? `album::${normAlbum}`
        : `single::${normAlbum || "untitled"}::${normArtist}::${track.id}`;

    const existing = clusters.get(clusterKey) || [];
    existing.push(track);
    clusters.set(clusterKey, existing);
  }

  const releases: ClusteredRelease[] = [];

  for (const [, releaseTracks] of clusters.entries()) {
    // Sort tracks by discNumber then trackNumber
    releaseTracks.sort((a, b) => {
      if (a.discNumber !== b.discNumber) return a.discNumber - b.discNumber;
      return a.trackNumber - b.trackNumber;
    });

    const firstTrack = releaseTracks[0];
    const albumTitle = firstTrack.albumTitle || "Untitled Album";

    // Determine release artist:
    // 1. Check if any track has explicit albumArtist tag
    // 2. If all tracks share the same primary artist (case-insensitive), use that artist name
    // 3. Otherwise default to "Various Artists"
    const commonAlbumArtist = releaseTracks.find((t) => t.albumArtist?.trim())?.albumArtist?.trim();
    const firstArtistNorm = (firstTrack.artistName || "").toLowerCase().trim();
    const allSameArtist = releaseTracks.every(
      (t) => (t.artistName || "").toLowerCase().trim() === firstArtistNorm
    );
    const artistName =
      commonAlbumArtist ||
      (allSameArtist ? (firstTrack.artistName || "Unknown Artist") : "Various Artists");

    // Auto-detect release type
    let albumType: "ALBUM" | "EP" | "SINGLE" = "ALBUM";
    if (releaseTracks.length === 1) {
      albumType = "SINGLE";
    } else if (releaseTracks.length <= 6) {
      albumType = "EP";
    }

    // Pick first available embedded cover in the cluster
    const coverTrack = releaseTracks.find((t) => t.coverFile !== null);

    releases.push({
      id: `release_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`,
      artistName,
      albumTitle,
      albumType,
      genre: firstTrack.genre || null,
      releaseDate: new Date().toISOString().split("T")[0],
      coverFile: coverTrack?.coverFile || null,
      coverPreviewUrl: coverTrack?.coverPreviewUrl || null,
      tracks: releaseTracks,
    });
  }

  return releases;
}

export interface ExistingCollectionTrack {
  title: string;
  artistName: string;
  albumTitle: string;
  durationSeconds: number;
}

export interface DeduplicationResult {
  uniqueTracks: ParsedTrack[];
  duplicateCount: number;
  duplicateDetails: Array<{
    title: string;
    artistName: string;
    albumTitle: string;
    reason: "already_in_collection" | "duplicate_in_upload_batch";
  }>;
}

/**
 * Deduplicates parsed tracks against:
 * 1. The user's active personal collection library (already uploaded)
 * 2. Any tracks already staged in current session
 * 3. Intra-batch duplicates (same track selected twice)
 *
 * Matching rule: Same title, same artist, same album, duration within +/- 2s.
 */
export function deduplicateParsedTracks(
  incomingTracks: ParsedTrack[],
  existingCollectionTracks: ExistingCollectionTrack[] = [],
  currentlyStagedTracks: ParsedTrack[] = []
): DeduplicationResult {
  const uniqueTracks: ParsedTrack[] = [];
  const duplicateDetails: DeduplicationResult["duplicateDetails"] = [];

  const isMatch = (
    trackA: { title: string; artistName: string; albumTitle: string; durationSeconds: number },
    trackB: { title: string; artistName: string; albumTitle: string; durationSeconds: number }
  ): boolean => {
    const titleA = (trackA.title || "").trim().toLowerCase();
    const titleB = (trackB.title || "").trim().toLowerCase();
    if (titleA !== titleB) return false;

    const artistA = (trackA.artistName || "").trim().toLowerCase();
    const artistB = (trackB.artistName || "").trim().toLowerCase();
    if (artistA !== artistB) return false;

    const albumA = (trackA.albumTitle || "").trim().toLowerCase();
    const albumB = (trackB.albumTitle || "").trim().toLowerCase();
    if (albumA !== albumB) return false;

    // Duration tolerance: within 2 seconds
    const durA = trackA.durationSeconds || 0;
    const durB = trackB.durationSeconds || 0;
    if (durA > 0 && durB > 0 && Math.abs(durA - durB) > 2) return false;

    return true;
  };

  for (const track of incomingTracks) {
    // 1. Check against user's already imported library
    const inCollection = existingCollectionTracks.some((ext) => isMatch(track, ext));
    if (inCollection) {
      duplicateDetails.push({
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        reason: "already_in_collection",
      });
      continue;
    }

    // 2. Check against tracks already staged in previous drops
    const inStaged = currentlyStagedTracks.some((st) => isMatch(track, st));
    if (inStaged) {
      duplicateDetails.push({
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        reason: "duplicate_in_upload_batch",
      });
      continue;
    }

    // 3. Check against other tracks in this current incoming batch
    const inCurrentUnique = uniqueTracks.some((ut) => isMatch(track, ut));
    if (inCurrentUnique) {
      duplicateDetails.push({
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        reason: "duplicate_in_upload_batch",
      });
      continue;
    }

    uniqueTracks.push(track);
  }

  return {
    uniqueTracks,
    duplicateCount: duplicateDetails.length,
    duplicateDetails,
  };
}
