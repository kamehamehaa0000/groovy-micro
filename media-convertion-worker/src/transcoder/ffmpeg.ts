import fs from "node:fs";
import path from "node:path";
import { resolveFfmpeg } from "../lib/ffmpeg-resolver";
import { runProcess } from "../lib/ffmpeg-process";

export interface HlsVariant {
  name: string;
  bitrate: string;
  sampleRate: number;
}

export const DEFAULT_VARIANTS: HlsVariant[] = [
  { name: "128k", bitrate: "128k", sampleRate: 44100 },
  { name: "192k", bitrate: "192k", sampleRate: 44100 },
  { name: "320k", bitrate: "320k", sampleRate: 48000 },
];

/**
 * A single output produced by one FFmpeg run.
 *
 * Every plan is fed from the same `asplit` of the decoded source, so any
 * combination of outputs costs exactly ONE decode of the input file.
 */
export type OutputPlan =
  | { kind: "hls"; dir: string; variants: HlsVariant[] }
  | { kind: "loudness" }
  | {
      kind: "pcm";
      path: string;
      sampleRate: number;
      /** Truncate the written PCM to this many seconds. */
      maxSeconds?: number;
    };

export interface FfmpegPipelineOptions {
  segmentDurationSeconds?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface FfmpegPipelineResult {
  stderr: string;
}

export interface HlsTranscodeOptions {
  segmentDurationSeconds?: number;
  variants?: HlsVariant[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_SEGMENT_DURATION_SECONDS = 6;

/**
 * Builds the FFmpeg argument vector for a multi-output run.
 *
 * The graph is `[0:a]asplit=N[...]`, with one branch per HLS variant plus one
 * branch per auxiliary output. The loudness branch is additionally routed
 * through `ebur128`, which prints its summary to stderr when the run ends.
 */
export function buildFfmpegArgs(
  inputFilePath: string,
  plans: OutputPlan[],
  segmentDurationSeconds: number = DEFAULT_SEGMENT_DURATION_SECONDS
): string[] {
  // Count the number of `asplit` branches required.
  const branchCount = plans.reduce(
    (total, plan) => total + (plan.kind === "hls" ? plan.variants.length : 1),
    0
  );

  if (branchCount === 0) {
    throw new Error("buildFfmpegArgs requires at least one output plan");
  }

  const labels = Array.from({ length: branchCount }, (_, i) => `a${i}`);
  const graphParts: string[] = [];
  const resolved: { plan: OutputPlan; labels: string[] }[] = [];

  let cursor = 0;
  for (const plan of plans) {
    if (plan.kind === "hls") {
      const owned = labels.slice(cursor, cursor + plan.variants.length);
      cursor += plan.variants.length;
      resolved.push({ plan, labels: owned });
    } else {
      resolved.push({ plan, labels: [labels[cursor]] });
      cursor += 1;
    }
  }

  graphParts.push(
    `[0:a]asplit=${branchCount}${labels.map((l) => `[${l}]`).join("")}`
  );

  // Route the loudness branch through ebur128 so it emits its summary.
  let loudnessLabel: string | null = null;
  for (const entry of resolved) {
    if (entry.plan.kind === "loudness") {
      loudnessLabel = `${entry.labels[0]}_loud`;
      graphParts.push(
        `[${entry.labels[0]}]ebur128=peak=true:framelog=quiet[${loudnessLabel}]`
      );
      break;
    }
  }

  const needsLoudness = loudnessLabel !== null;

  const args: string[] = [
    "-hide_banner",
    "-nostats",
    "-y",
    // The ebur128 summary is logged at INFO level; `framelog=quiet` keeps the
    // per-frame readings out of stderr.
    "-loglevel",
    needsLoudness ? "info" : "error",
    "-i",
    inputFilePath,
    "-filter_complex",
    graphParts.join(";"),
  ];

  for (const entry of resolved) {
    const plan = entry.plan;

    if (plan.kind === "hls") {
      plan.variants.forEach((variant, i) => {
        args.push(
          "-map",
          `[${entry.labels[i]}]`,
          `-c:a:${i}`,
          "aac",
          `-b:a:${i}`,
          variant.bitrate,
          `-ar:a:${i}`,
          String(variant.sampleRate)
        );
      });

      args.push(
        "-f",
        "hls",
        "-hls_time",
        String(segmentDurationSeconds),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_type",
        "mpegts",
        "-hls_flags",
        "independent_segments",
        "-master_pl_name",
        "master.m3u8",
        "-var_stream_map",
        plan.variants.map((v, i) => `a:${i},name:${v.name}`).join(" "),
        path.join(plan.dir, "%v", "index.m3u8").replace(/\\/g, "/")
      );
      continue;
    }

    if (plan.kind === "loudness") {
      args.push("-map", `[${loudnessLabel}]`, "-f", "null", "-");
      continue;
    }

    if (plan.maxSeconds !== undefined) {
      args.push("-t", String(plan.maxSeconds));
    }
    args.push(
      "-map",
      `[${entry.labels[0]}]`,
      "-ac",
      "1",
      "-ar",
      String(plan.sampleRate),
      "-f",
      "f32le",
      plan.path
    );
  }

  return args;
}

/**
 * Runs a single FFmpeg invocation that produces every requested output.
 */
export async function runFfmpegPipeline(
  inputFilePath: string,
  plans: OutputPlan[],
  options: FfmpegPipelineOptions = {}
): Promise<FfmpegPipelineResult> {
  const { ffmpegPath } = resolveFfmpeg();
  const args = buildFfmpegArgs(
    inputFilePath,
    plans,
    options.segmentDurationSeconds ?? DEFAULT_SEGMENT_DURATION_SECONDS
  );

  const result = await runProcess(ffmpegPath, args, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    captureStdout: false,
  });

  return { stderr: result.stderr };
}

/**
 * Encodes a multi-bitrate HLS ladder from the source file.
 *
 * All variants and the master playlist are produced in a single FFmpeg pass
 * using an `asplit` filter graph.
 */
export async function transcodeToHls(
  inputFilePath: string,
  outputDirectory: string,
  options: HlsTranscodeOptions = {}
): Promise<{ masterPlaylistPath: string; variantCount: number }> {
  const variants = options.variants || DEFAULT_VARIANTS;

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  await runFfmpegPipeline(
    inputFilePath,
    [{ kind: "hls", dir: outputDirectory, variants }],
    {
      segmentDurationSeconds: options.segmentDurationSeconds,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    }
  );

  const masterPlaylistPath = path.join(outputDirectory, "master.m3u8");
  if (!fs.existsSync(masterPlaylistPath)) {
    throw new Error(
      `Transcoding completed but master.m3u8 was not generated in: ${outputDirectory}`
    );
  }

  return { masterPlaylistPath, variantCount: variants.length };
}
