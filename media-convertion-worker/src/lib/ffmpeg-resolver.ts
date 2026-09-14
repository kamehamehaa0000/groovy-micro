import { execSync } from "node:child_process";
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
  try {
    execSync(`"${ffmpegPath}" -version`, { stdio: "ignore" });
  } catch {
    throw new Error(
      `FFmpeg executable not found at "${ffmpegPath}". Please install FFmpeg (e.g. Gyan.dev on Windows or via package manager) or set FFMPEG_PATH in .env.`
    );
  }

  try {
    execSync(`"${ffprobePath}" -version`, { stdio: "ignore" });
  } catch {
    throw new Error(
      `FFprobe executable not found at "${ffprobePath}". Please install FFprobe or set FFPROBE_PATH in .env.`
    );
  }

  cachedBinaries = { ffmpegPath, ffprobePath };
  return cachedBinaries;
}
