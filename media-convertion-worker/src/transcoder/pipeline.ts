import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import type { SongAudioAnalysis } from "../lib/schema";
import {
  DEFAULT_VARIANTS,
  runFfmpegPipeline,
  type HlsVariant,
  type OutputPlan,
} from "./ffmpeg";
import {
  buildAnalysisPlans,
  computeBpmWindow,
  interpretAnalysisArtifacts,
  probeAudio,
  type AnalysisArtifacts,
} from "./audio-analyzer";

export interface TranscodeSongOptions {
  segmentDurationSeconds?: number;
  variants?: HlsVariant[];
  /** Directory for the intermediate PCM artifacts. */
  artifactsDir: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TranscodeSongResult {
  analysis: SongAudioAnalysis;
  masterPlaylistPath: string;
  variantCount: number;
}

/**
 * Transcodes a source file into a multi-bitrate HLS ladder and measures it
 * (EBU R128 loudness, waveform peaks, BPM) in a SINGLE FFmpeg pass.
 *
 * The source file is decoded once and the resulting PCM is fanned out with an
 * `asplit` filter graph into the three HLS encoders, the `ebur128` meter and
 * the two PCM taps. This replaces the previous four separate decodes
 * (ffprobe, loudness, waveform, BPM) plus a fifth for the encode.
 */
export async function transcodeSong(
  inputFilePath: string,
  hlsOutputDir: string,
  options: TranscodeSongOptions
): Promise<TranscodeSongResult> {
  const variants = options.variants || DEFAULT_VARIANTS;

  if (!fs.existsSync(hlsOutputDir)) {
    fs.mkdirSync(hlsOutputDir, { recursive: true });
  }
  if (!fs.existsSync(options.artifactsDir)) {
    fs.mkdirSync(options.artifactsDir, { recursive: true });
  }

  const probe = await probeAudio(inputFilePath, {
    signal: options.signal,
    timeoutMs: config.PROBE_TIMEOUT_MS,
  });
  const bpmWindow = computeBpmWindow(probe.durationSeconds);

  const artifacts: AnalysisArtifacts = {
    waveformPath: path.join(options.artifactsDir, "waveform.f32"),
    bpmPath: path.join(options.artifactsDir, "bpm.f32"),
  };

  const plans: OutputPlan[] = [
    { kind: "hls", dir: hlsOutputDir, variants },
    ...buildAnalysisPlans(artifacts, bpmWindow),
  ];

  const { stderr } = await runFfmpegPipeline(inputFilePath, plans, {
    segmentDurationSeconds: options.segmentDurationSeconds,
    timeoutMs: options.timeoutMs ?? config.FFMPEG_TIMEOUT_MS,
    signal: options.signal,
  });

  const masterPlaylistPath = path.join(hlsOutputDir, "master.m3u8");
  if (!fs.existsSync(masterPlaylistPath)) {
    throw new Error(
      `Transcoding completed but master.m3u8 was not generated in: ${hlsOutputDir}`
    );
  }

  const { analysis } = interpretAnalysisArtifacts(artifacts, probe, stderr);

  return { analysis, masterPlaylistPath, variantCount: variants.length };
}
