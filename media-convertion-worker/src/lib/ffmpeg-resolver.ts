import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { config } from "../config";

interface ResolvedBinaries {
  ffmpegPath: string;
  ffprobePath: string;
}

let cachedBinaries: ResolvedBinaries | null = null;

export function resolveFfmpeg(): ResolvedBinaries {
  if (cachedBinaries) {
    return cachedBinaries;
  }

  let ffmpegPath = config.FFMPEG_PATH;
  let ffprobePath = config.FFPROBE_PATH;

  // 1. Check explicit configuration path
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    if (!ffprobePath) {
      const probeSibling = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
      if (fs.existsSync(probeSibling)) {
        ffprobePath = probeSibling;
      }
    }
  } else {
    ffmpegPath = "ffmpeg";
  }

  if (!ffprobePath) {
    ffprobePath = "ffprobe";
  }

  // 2. Validate availability by running -version
  //    spawnSync without a shell: no quoting issues, no shell injection.
  const ffmpegVersion = spawnSync(ffmpegPath, ["-version"], { stdio: "ignore" });
  if (ffmpegVersion.error || ffmpegVersion.status !== 0) {
    throw new Error(
      `FFmpeg executable not found at "${ffmpegPath}". Please install FFmpeg (e.g. Gyan.dev on Windows or via package manager) or set FFMPEG_PATH in .env.`
    );
  }

  const ffprobeVersion = spawnSync(ffprobePath, ["-version"], { stdio: "ignore" });
  if (ffprobeVersion.error || ffprobeVersion.status !== 0) {
    throw new Error(
      `FFprobe executable not found at "${ffprobePath}". Please install FFprobe or set FFPROBE_PATH in .env.`
    );
  }

  cachedBinaries = { ffmpegPath, ffprobePath };
  return cachedBinaries;
}
