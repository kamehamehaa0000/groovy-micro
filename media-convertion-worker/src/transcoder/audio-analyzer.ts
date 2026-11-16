import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import MusicTempo from "music-tempo";
import { config } from "../config";
import { resolveFfmpeg } from "../lib/ffmpeg-resolver";
import { runProcess } from "../lib/ffmpeg-process";
import { runFfmpegPipeline, type OutputPlan } from "./ffmpeg";
import type { SongAudioAnalysis } from "../lib/schema";

export interface ProbeResult {
  durationSeconds: number;
  format: string;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
  bitrateKbps?: number;
  probedBpm?: number;
  probedKey?: string;
}

export interface LoudnessMetrics {
  integratedLufs: number;
  truePeakDbfs: number;
  loudnessRangeLu: number;
}

/** Sample rate used for the client-facing waveform peaks. */
export const WAVEFORM_SAMPLE_RATE = 8000;
/** Sample rate used for the beat-detection buffer. */
export const BPM_SAMPLE_RATE = 22050;
/** music-tempo analyses a 2048-sample window every 441 samples. */
export const MUSIC_TEMPO_HOP_SIZE = 441;

const DEFAULT_LOUDNESS: LoudnessMetrics = {
  integratedLufs: -14.0,
  truePeakDbfs: -1.0,
  loudnessRangeLu: 6.0,
};

export interface AnalysisOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Runs ffprobe to extract technical container and stream details, as well as metadata tags.
 */
export async function probeAudio(
  filePath: string,
  options: AnalysisOptions = {}
): Promise<ProbeResult> {
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

  const result = await runProcess(ffprobePath, args, {
    timeoutMs: options.timeoutMs ?? config.PROBE_TIMEOUT_MS,
    signal: options.signal,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `ffprobe failed on "${filePath}": ${result.stderr || "Unknown error"}`
    );
  }

  const parsed = JSON.parse(result.stdout.toString("utf8"));
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
 * Parses the EBU R128 summary that the `ebur128` filter prints to stderr.
 *
 * The summary is only emitted at FFmpeg's INFO log level, so callers must run
 * FFmpeg with `-loglevel info` for this to return real measurements.
 */
export function parseLoudnessSummary(stderr: string): LoudnessMetrics {
  const iMatch = stderr.match(/Integrated loudness:\s+I:\s+([-\d.]+)\s+LUFS/);
  const integratedLufs = iMatch ? parseFloat(iMatch[1]) : NaN;

  const tpMatch = stderr.match(/True peak:\s+Peak:\s+([-\d.]+)\s+dBFS/);
  const truePeakDbfs = tpMatch ? parseFloat(tpMatch[1]) : NaN;

  const lraMatch = stderr.match(/Loudness range:\s+LRA:\s+([-\d.]+)\s+LU/);
  const loudnessRangeLu = lraMatch ? parseFloat(lraMatch[1]) : NaN;

  return {
    integratedLufs: Number.isNaN(integratedLufs)
      ? DEFAULT_LOUDNESS.integratedLufs
      : integratedLufs,
    truePeakDbfs: Number.isNaN(truePeakDbfs)
      ? DEFAULT_LOUDNESS.truePeakDbfs
      : truePeakDbfs,
    loudnessRangeLu: Number.isNaN(loudnessRangeLu)
      ? DEFAULT_LOUDNESS.loudnessRangeLu
      : loudnessRangeLu,
  };
}

/**
 * Extracts EBU R128 loudness metrics in a dedicated FFmpeg pass.
 *
 * Prefer `runAnalysisPipeline` / `transcodeSong`, which measure loudness as
 * part of the same pass that encodes the HLS ladder.
 */
export async function extractLoudness(
  filePath: string,
  options: AnalysisOptions = {}
): Promise<LoudnessMetrics> {
  const { stderr } = await runFfmpegPipeline(
    filePath,
    [{ kind: "loudness" }],
    {
      timeoutMs: options.timeoutMs ?? config.FFMPEG_TIMEOUT_MS,
      signal: options.signal,
    }
  );
  return parseLoudnessSummary(stderr);
}

/**
 * Reinterprets a raw PCM buffer as 32-bit floats.
 *
 * The slice guarantees 4-byte alignment, which `Buffer.buffer` alone does not.
 */
export function bufferToFloat32(buffer: Buffer): Float32Array {
  const usable = buffer.length - (buffer.length % 4);
  const copy = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + usable
  );
  return new Float32Array(copy);
}

/**
 * Reduces a PCM buffer to a normalized 100-point waveform array.
 */
export function computeWaveformPeaks(
  samples: Float32Array,
  points: number = 100
): number[] {
  if (samples.length < points) {
    return Array.from({ length: points }, () => 0.2);
  }

  const chunkSize = Math.floor(samples.length / points);
  const waveform: number[] = [];
  let globalMax = 0.001;

  for (let p = 0; p < points; p++) {
    const start = p * chunkSize;
    const end = Math.min(start + chunkSize, samples.length);
    let peak = 0;

    for (let i = start; i < end; i++) {
      const abs = Math.abs(samples[i]);
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
  return waveform.map((val) => Math.round((val / globalMax) * 1000) / 1000);
}

/**
 * Extracts a normalized 100-point waveform array for rapid client visualization.
 */
export async function extractWaveform(
  filePath: string,
  points: number = 100,
  options: AnalysisOptions = {}
): Promise<number[]> {
  const artifactsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "groovy-waveform-")
  );
  const rawPath = path.join(artifactsDir, "waveform.f32");

  try {
    await runFfmpegPipeline(
      filePath,
      [{ kind: "pcm", path: rawPath, sampleRate: WAVEFORM_SAMPLE_RATE }],
      {
        timeoutMs: options.timeoutMs ?? config.FFMPEG_TIMEOUT_MS,
        signal: options.signal,
      }
    );

    if (!fs.existsSync(rawPath)) {
      return Array.from({ length: points }, () => 0.2);
    }

    return computeWaveformPeaks(bufferToFloat32(fs.readFileSync(rawPath)), points);
  } finally {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
}

/**
 * Chooses the window of audio used for beat detection.
 *
 * Long tracks are sampled from 10 seconds in to skip the intro, short tracks
 * are analysed from the beginning.
 */
export function computeBpmWindow(durationSeconds: number): {
  seekSeconds: number;
  durationSeconds: number;
} {
  const seekSeconds = durationSeconds > 45 ? 10 : 0;
  const windowSeconds = Math.min(
    30,
    Math.max(durationSeconds - seekSeconds, 10)
  );
  return { seekSeconds, durationSeconds: windowSeconds };
}

/**
 * Runs beat detection over an already-decoded mono PCM buffer.
 *
 * `music-tempo` assumes a 44100 Hz input (its 441-sample hop is hardcoded to a
 * 10 ms timestep). Feeding it a buffer at a different rate without correcting
 * the timestep reports a doubled tempo, so the timestep is derived from the
 * actual sample rate here.
 */
export function detectBpmFromPcm(
  samples: Float32Array,
  sampleRate: number = BPM_SAMPLE_RATE,
  probedBpm?: number
): number | undefined {
  // Tier 1: Probed metadata tags
  if (probedBpm && probedBpm >= 40 && probedBpm <= 260) {
    return probedBpm;
  }

  // Tier 2: Algorithmic beat tracking
  try {
    const timeStep = MUSIC_TEMPO_HOP_SIZE / sampleRate;
    const mt = new MusicTempo(samples, { timeStep });
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
 * Detects musical tempo (BPM) using metadata tags (Tier 1) or beat-interval
 * analysis over a dedicated 30-second window (Tier 2).
 */
export async function detectBpm(
  filePath: string,
  durationSeconds: number,
  probedBpm?: number,
  options: AnalysisOptions = {}
): Promise<number | undefined> {
  if (probedBpm && probedBpm >= 40 && probedBpm <= 260) {
    return probedBpm;
  }

  const artifactsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "groovy-bpm-")
  );
  const rawPath = path.join(artifactsDir, "bpm.f32");

  try {
    const window = computeBpmWindow(durationSeconds);

    await runFfmpegPipeline(
      filePath,
      [
        {
          kind: "pcm",
          path: rawPath,
          sampleRate: BPM_SAMPLE_RATE,
          maxSeconds: window.seekSeconds + window.durationSeconds,
        },
      ],
      { timeoutMs: options.timeoutMs ?? config.FFMPEG_TIMEOUT_MS, signal: options.signal }
    );

    if (!fs.existsSync(rawPath)) {
      return undefined;
    }

    const samples = bufferToFloat32(fs.readFileSync(rawPath));
    const start = Math.floor(window.seekSeconds * BPM_SAMPLE_RATE);
    const end = Math.min(
      start + Math.floor(window.durationSeconds * BPM_SAMPLE_RATE),
      samples.length
    );
    const slice = samples.subarray(start, Math.max(end, start));

    return detectBpmFromPcm(slice, BPM_SAMPLE_RATE, probedBpm);
  } finally {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
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

export interface AnalysisArtifacts {
  waveformPath: string;
  bpmPath: string;
}

export interface AnalysisResult {
  analysis: SongAudioAnalysis;
  loudness: LoudnessMetrics;
}

/**
 * Builds the output plans that measure a file in a single FFmpeg pass.
 *
 * The loudness, waveform and BPM outputs all hang off the same `asplit`, so
 * the source file is decoded exactly once.
 */
export function buildAnalysisPlans(
  artifacts: AnalysisArtifacts,
  bpmWindow: { seekSeconds: number; durationSeconds: number }
): OutputPlan[] {
  return [
    { kind: "loudness" },
    {
      kind: "pcm",
      path: artifacts.waveformPath,
      sampleRate: WAVEFORM_SAMPLE_RATE,
    },
    {
      kind: "pcm",
      path: artifacts.bpmPath,
      sampleRate: BPM_SAMPLE_RATE,
      maxSeconds: bpmWindow.seekSeconds + bpmWindow.durationSeconds,
    },
  ];
}

/**
 * Turns the raw artifacts produced by an analysis pass into the final metrics.
 */
export function interpretAnalysisArtifacts(
  artifacts: AnalysisArtifacts,
  probe: ProbeResult,
  stderr: string
): AnalysisResult {
  const loudness = parseLoudnessSummary(stderr);

  let waveform: number[] = Array.from({ length: 100 }, () => 0.2);
  if (fs.existsSync(artifacts.waveformPath)) {
    waveform = computeWaveformPeaks(
      bufferToFloat32(fs.readFileSync(artifacts.waveformPath)),
      100
    );
  }

  let detectedBpm: number | undefined;
  if (fs.existsSync(artifacts.bpmPath)) {
    const window = computeBpmWindow(probe.durationSeconds);
    const samples = bufferToFloat32(fs.readFileSync(artifacts.bpmPath));
    const start = Math.floor(window.seekSeconds * BPM_SAMPLE_RATE);
    const end = Math.min(
      start + Math.floor(window.durationSeconds * BPM_SAMPLE_RATE),
      samples.length
    );
    const slice = samples.subarray(start, Math.max(end, start));
    detectedBpm = detectBpmFromPcm(slice, BPM_SAMPLE_RATE, probe.probedBpm);
  }

  const resolvedBpm = detectedBpm || probe.probedBpm;
  const energy = computeEnergy(loudness, resolvedBpm);

  const analysis: SongAudioAnalysis = {
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

  return { analysis, loudness };
}

/**
 * Comprehensive audio analysis pipeline extracting technical specs, EBU R128 loudness,
 * a 100-point waveform peak array, musical BPM, and energy metric.
 *
 * The whole pipeline costs a single decode of the source file.
 */
export async function analyzeAudio(
  filePath: string,
  options: AnalysisOptions = {}
): Promise<SongAudioAnalysis> {
  const probe = await probeAudio(filePath, options);
  const bpmWindow = computeBpmWindow(probe.durationSeconds);

  const artifactsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "groovy-analysis-")
  );
  const artifacts: AnalysisArtifacts = {
    waveformPath: path.join(artifactsDir, "waveform.f32"),
    bpmPath: path.join(artifactsDir, "bpm.f32"),
  };

  try {
    const { stderr } = await runFfmpegPipeline(
      filePath,
      buildAnalysisPlans(artifacts, bpmWindow),
      {
        timeoutMs: options.timeoutMs ?? config.FFMPEG_TIMEOUT_MS,
        signal: options.signal,
      }
    );

    return interpretAnalysisArtifacts(artifacts, probe, stderr).analysis;
  } finally {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
}
