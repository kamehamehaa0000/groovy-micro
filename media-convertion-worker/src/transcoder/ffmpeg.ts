import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveFfmpeg } from "../lib/ffmpeg-resolver";

export interface HlsVariant {
  name: string;
  bitrate: string;
  sampleRate: number;
}

export interface HlsTranscodeOptions {
  segmentDurationSeconds?: number;
  variants?: HlsVariant[];
  onProgress?: (percent: number) => void;
}

const DEFAULT_VARIANTS: HlsVariant[] = [
  { name: "128k", bitrate: "128k", sampleRate: 44100 },
  { name: "192k", bitrate: "192k", sampleRate: 44100 },
  { name: "320k", bitrate: "320k", sampleRate: 48000 },
];

/**
 * Executes single-pass multi-bitrate HLS segmentation using FFmpeg.
 * All variants and the master playlist are encoded in a single pass using asplit filter graph.
 */
export async function transcodeToHls(
  inputFilePath: string,
  outputDirectory: string,
  options: HlsTranscodeOptions = {}
): Promise<{ masterPlaylistPath: string; variantCount: number }> {
  const { ffmpegPath } = resolveFfmpeg();
  const segmentDuration = options.segmentDurationSeconds || 6;
  const variants = options.variants || DEFAULT_VARIANTS;

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  // Build filter graph: e.g. [0:a]asplit=3[a1][a2][a3]
  const splitOutputs = variants.map((_, i) => `[a${i}]`).join("");
  const filterComplex = `[0:a]asplit=${variants.length}${splitOutputs}`;

  const args: string[] = [
    "-v",
    "error",
    "-y",
    "-i",
    inputFilePath,
    "-filter_complex",
    filterComplex,
  ];

  // Map each split output to its encoding parameters
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    args.push(
      "-map",
      `[a${i}]`,
      `-c:a:${i}`,
      "aac",
      `-b:a:${i}`,
      v.bitrate,
      `-ar:a:${i}`,
      v.sampleRate.toString()
    );
  }

  // Stream mapping for HLS multi-variant output
  // e.g. "a:0,name:128k a:1,name:192k a:2,name:320k"
  const varStreamMap = variants
    .map((v, i) => `a:${i},name:${v.name}`)
    .join(" ");

  const outputPattern = path.join(outputDirectory, "%v", "index.m3u8").replace(/\\/g, "/");

  args.push(
    "-f",
    "hls",
    "-hls_time",
    segmentDuration.toString(),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "mpegts",
    "-hls_flags",
    "independent_segments",
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    varStreamMap,
    outputPattern
  );

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg process: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`FFmpeg transcoding failed with code ${code}: ${stderr || "Unknown error"}`)
        );
      }

      const masterPlaylistPath = path.join(outputDirectory, "master.m3u8");
      if (!fs.existsSync(masterPlaylistPath)) {
        return reject(
          new Error(`Transcoding completed but master.m3u8 was not generated in: ${outputDirectory}`)
        );
      }

      resolve({
        masterPlaylistPath,
        variantCount: variants.length,
      });
    });
  });
}
