import { spawnSync } from "node:child_process";
import MusicTempo from "music-tempo";
import { resolveFfmpeg } from "../lib/ffmpeg-resolver";
import type { SongAudioAnalysis } from "../lib/schema";

interface ProbeResult {
  durationSeconds: number;
  format: string;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
  bitrateKbps?: number;
  probedBpm?: number;
  probedKey?: string;
}

/**
 * Runs ffprobe to extract technical container and stream details, as well as metadata tags.
 */
export function probeAudio(filePath: string): ProbeResult {
  const { ffprobePath } = resolveFfmpeg();

  const args = [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ];

  const result = spawnSync(ffprobePath, args, { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`ffprobe failed on "${filePath}": ${result.stderr || "Unknown error"}`);
  }

  const parsed = JSON.parse(result.stdout);
  const audioStream = parsed.streams?.find(
    (s: { codec_type?: string }) => s.codec_type === "audio"
  );

  if (!audioStream) {
    throw new Error(`No audio stream found in file: ${filePath}`);
  }

  const durationSeconds = Math.round(
    parseFloat(parsed.format?.duration || audioStream.duration || "0")
  );

  const sampleRate = parseInt(audioStream.sample_rate || "44100", 10);
  const channels = parseInt(audioStream.channels || "2", 10);
  const bitDepth =
    parseInt(audioStream.bits_per_raw_sample || audioStream.bits_per_sample, 10) ||
    undefined;
  const bitrateKbps = parsed.format?.bit_rate
    ? Math.round(parseInt(parsed.format.bit_rate, 10) / 1000)
    : undefined;

  // Extract ID3 / Vorbis metadata tags
  const tags = {
    ...(parsed.format?.tags || {}),
    ...(audioStream.tags || {}),
  };

  let probedBpm: number | undefined;
  const rawBpm = tags.BPM || tags.bpm || tags.TBPM || tags.tbpm;
  if (rawBpm) {
    const val = parseFloat(rawBpm);
    if (!Number.isNaN(val) && val >= 40 && val <= 260) {
      probedBpm = Math.round(val);
    }
  }

  let probedKey: string | undefined;
  const rawKey = tags.KEY || tags.key || tags.initialkey || tags.TKEY;
  if (rawKey && typeof rawKey === "string") {
    probedKey = rawKey.trim();
  }

  return {
    durationSeconds,
    format: parsed.format?.format_name?.split(",")[0] || "unknown",
    sampleRate,
    channels,
    bitDepth,
    bitrateKbps,
    probedBpm,
    probedKey,
  };
}

/**
 * Extracts EBU R128 loudness metrics (integrated loudness in LUFS, True Peak in dBFS, LRA).
 */
export function extractLoudness(filePath: string): {
  integratedLufs: number;
  truePeakDbfs: number;
  loudnessRangeLu: number;
} {
  const { ffmpegPath } = resolveFfmpeg();

  const args = [
    "-v",
    "error",
    "-i",
    filePath,
    "-af",
    "ebur128=peak=true",
    "-f",
    "null",
    "-",
  ];

  const result = spawnSync(ffmpegPath, args, { encoding: "utf-8" });
  const output = result.stderr || "";

  // Parse Integrated loudness
  const iMatch = output.match(/Integrated loudness:\s+I:\s+([-\d.]+)\s+LUFS/);
  const integratedLufs = iMatch ? parseFloat(iMatch[1]) : -14.0;

  // Parse True Peak
  const tpMatch = output.match(/True peak:\s+Peak:\s+([-\d.]+)\s+dBFS/);
  const truePeakDbfs = tpMatch ? parseFloat(tpMatch[1]) : -1.0;

  // Parse Loudness Range
  const lraMatch = output.match(/Loudness range:\s+LRA:\s+([-\d.]+)\s+LU/);
  const loudnessRangeLu = lraMatch ? parseFloat(lraMatch[1]) : 6.0;

  return {
    integratedLufs: Number.isNaN(integratedLufs) ? -14.0 : integratedLufs,
    truePeakDbfs: Number.isNaN(truePeakDbfs) ? -1.0 : truePeakDbfs,
    loudnessRangeLu: Number.isNaN(loudnessRangeLu) ? 6.0 : loudnessRangeLu,
  };
}

/**
 * Extracts a normalized 100-point waveform array (values 0.0 to 1.0) for rapid client visualization.
 */
export function extractWaveform(filePath: string, points: number = 100): number[] {
  const { ffmpegPath } = resolveFfmpeg();

  const args = [
    "-v",
    "error",
    "-i",
    filePath,
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "f32le",
    "-",
  ];

  const result = spawnSync(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 });
  if (!result.stdout || result.stdout.length === 0) {
    // Fallback: return neutral flat waveform
    return Array.from({ length: points }, () => 0.2);
  }

  const f32Array = new Float32Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    result.stdout.length / 4
  );

  if (f32Array.length < points) {
    return Array.from({ length: points }, () => 0.2);
  }

  const chunkSize = Math.floor(f32Array.length / points);
  const waveform: number[] = [];
  let globalMax = 0.001;

  for (let p = 0; p < points; p++) {
    const start = p * chunkSize;
    const end = Math.min(start + chunkSize, f32Array.length);
    let peak = 0;

    for (let i = start; i < end; i++) {
      const abs = Math.abs(f32Array[i]);
      if (abs > peak) {
        peak = abs;
      }
    }

    if (peak > globalMax) {
      globalMax = peak;
    }
    waveform.push(peak);
  }

  // Normalize so highest peak = 1.0, rounded to 3 decimal places
  return waveform.map((val) =>
    Math.round((val / globalMax) * 1000) / 1000
  );
}

/**
 * Detects musical tempo (BPM) using metadata tags (Tier 1) or beat-interval analysis (Tier 2).
 */
export function detectBpm(filePath: string, durationSeconds: number, probedBpm?: number): number | undefined {
  // Tier 1: Probed metadata tags
  if (probedBpm && probedBpm >= 40 && probedBpm <= 260) {
    return probedBpm;
  }

  // Tier 2: Algorithmic beat tracking using music-tempo on a 30-second sample
  try {
    const { ffmpegPath } = resolveFfmpeg();
    const seekOffset = durationSeconds > 45 ? 10 : 0;
    const sampleDuration = Math.min(30, Math.max(durationSeconds - seekOffset, 10));

    const args = [
      "-v",
      "error",
      "-ss",
      seekOffset.toString(),
      "-t",
      sampleDuration.toString(),
      "-i",
      filePath,
      "-ac",
      "1",
      "-ar",
      "22050",
      "-f",
      "f32le",
      "-",
    ];

    const result = spawnSync(ffmpegPath, args, { maxBuffer: 20 * 1024 * 1024 });
    if (!result.stdout || result.stdout.length === 0) {
      return undefined;
    }

    const f32Array = new Float32Array(
      result.stdout.buffer,
      result.stdout.byteOffset,
      result.stdout.length / 4
    );

    const mt = new MusicTempo(f32Array);
    const tempo = Math.round(mt.tempo);

    if (tempo >= 40 && tempo <= 260) {
      return tempo;
    }
  } catch {
    // Non-fatal if BPM analysis fails on noisy/speech audio
  }

  return undefined;
}

/**
 * Computes a normalized perceived energy metric (0.0 to 1.0) based on integrated loudness (LUFS)
 * and detected tempo (BPM).
 * - Integrated LUFS typical music range: -24 LUFS (quiet/ambient) to -6 LUFS (loud master)
 * - BPM typical range: 60 BPM to 175 BPM
 */
export function computeEnergy(
  loudness: { integratedLufs: number; loudnessRangeLu: number },
  bpm?: number
): number {
  const lufsNorm = Math.min(1, Math.max(0, (loudness.integratedLufs - -24) / (-6 - -24)));
  const bpmNorm = bpm ? Math.min(1, Math.max(0, (bpm - 60) / (175 - 60))) : 0.5;
  const rawEnergy = lufsNorm * 0.65 + bpmNorm * 0.35;
  const clamped = Math.min(0.99, Math.max(0.05, rawEnergy));
  return Math.round(clamped * 100) / 100;
}

/**
 * Comprehensive audio analysis pipeline extracting technical specs, EBU R128 loudness,
 * a 100-point waveform peak array, musical BPM, and energy metric.
 */
export function analyzeAudio(filePath: string): SongAudioAnalysis {
  const probe = probeAudio(filePath);
  const loudness = extractLoudness(filePath);
  const waveform = extractWaveform(filePath, 100);
  const bpm = detectBpm(filePath, probe.durationSeconds, probe.probedBpm);
  const resolvedBpm = bpm || probe.probedBpm;
  const energy = computeEnergy(loudness, resolvedBpm);

  return {
    durationSeconds: probe.durationSeconds,
    specs: {
      format: probe.format,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      bitDepth: probe.bitDepth,
      bitrateKbps: probe.bitrateKbps,
    },
    loudness,
    waveform,
    musical: {
      bpm: resolvedBpm,
      key: probe.probedKey,
    },
    energy,
  };
}
