import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveFfmpeg } from "../src/lib/ffmpeg-resolver";
import {
  probeAudio,
  extractLoudness,
  extractWaveform,
  detectBpm,
  analyzeAudio,
  parseLoudnessSummary,
  computeBpmWindow,
  computeWaveformPeaks,
  detectBpmFromPcm,
  bufferToFloat32,
} from "../src/transcoder/audio-analyzer";
import { transcodeToHls } from "../src/transcoder/ffmpeg";
import { transcodeSong } from "../src/transcoder/pipeline";
import { db, songs } from "../src/lib/db";
import { eq } from "drizzle-orm";

describe("Media Transcoder Worker Test Suite", () => {
  const testDir = path.join(os.tmpdir(), `groovy-test-${Date.now()}`);
  const sampleWavPath = path.join(testDir, "test_sample.wav");
  const hlsOutputDir = path.join(testDir, "hls_output");
  const fusedHlsDir = path.join(testDir, "fused_hls");
  const fusedArtifactsDir = path.join(testDir, "fused_artifacts");

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });

    // Generate a 10-second 440Hz stereo audio tone using FFmpeg for testing
    const { ffmpegPath } = resolveFfmpeg();
    execFileSync(ffmpegPath, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=10",
      "-ac",
      "2",
      "-ar",
      "44100",
      sampleWavPath,
    ]);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore test cleanup errors
      }
    }
  });

  it("1. Binary Resolver: accurately identifies FFmpeg and FFprobe", () => {
    const binaries = resolveFfmpeg();
    expect(binaries).toBeDefined();
    expect(binaries.ffmpegPath).toBeTruthy();
    expect(binaries.ffprobePath).toBeTruthy();
  });

  it("2. Probe Audio: extracts duration, channels, sample rate, and format", async () => {
    const probe = await probeAudio(sampleWavPath);
    expect(probe.durationSeconds).toBe(10);
    expect(probe.sampleRate).toBe(44100);
    expect(probe.channels).toBe(2);
    expect(probe.format).toBe("wav");
  });

  it("3. Loudness Analysis: extracts real EBU R128 metrics (LUFS & True Peak)", async () => {
    const loudness = await extractLoudness(sampleWavPath);
    expect(typeof loudness.integratedLufs).toBe("number");
    expect(typeof loudness.truePeakDbfs).toBe("number");
    expect(typeof loudness.loudnessRangeLu).toBe("number");
    // Standard pure sine tone is ~ -21.8 LUFS. This assertion only holds if the
    // ebur128 summary was actually parsed instead of falling back to defaults.
    expect(loudness.integratedLufs).toBeCloseTo(-21.8, 1);
    expect(loudness.integratedLufs).toBeLessThan(-10);
  });

  it("4. Loudness Parser: extracts LUFS, True Peak and LRA from an ebur128 summary", () => {
    const stderr = `
[Parsed_ebur128_0 @ 0000] Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.2 LUFS

  Loudness range:
    LRA:         6.5 LU
    Threshold: -37.2 LUFS

  True peak:
    Peak:       -0.8 dBFS
`;
    const parsed = parseLoudnessSummary(stderr);
    expect(parsed.integratedLufs).toBe(-14.2);
    expect(parsed.truePeakDbfs).toBe(-0.8);
    expect(parsed.loudnessRangeLu).toBe(6.5);
  });

  it("5. Waveform Extraction: produces 100 normalized peak points (0.0 - 1.0)", async () => {
    const waveform = await extractWaveform(sampleWavPath, 100);
    expect(waveform).toBeArray();
    expect(waveform.length).toBe(100);

    const maxVal = Math.max(...waveform);
    const minVal = Math.min(...waveform);
    expect(maxVal).toBeLessThanOrEqual(1.0);
    expect(minVal).toBeGreaterThanOrEqual(0.0);
    expect(maxVal).toBeCloseTo(1.0, 3);
  });

  it("6. Waveform Bucketing: normalizes peaks and falls back for short input", () => {
    const peaks = computeWaveformPeaks(Float32Array.from([0.5, -1, 0.25, 0.75]), 2);
    expect(peaks).toEqual([1, 0.75]);

    const tooShort = computeWaveformPeaks(Float32Array.from([0.5]), 100);
    expect(tooShort.length).toBe(100);
    expect(tooShort.every((v) => v === 0.2)).toBe(true);
  });

  it("7. BPM Detection: handles audio samples gracefully", async () => {
    const bpm = await detectBpm(sampleWavPath, 10);
    // Sine tone has no beats, so should return undefined or a fallback
    expect(bpm === undefined || typeof bpm === "number").toBe(true);
  });

  it("8. BPM Window: skips the intro on long tracks, analyses short ones whole", () => {
    expect(computeBpmWindow(10)).toEqual({ seekSeconds: 0, durationSeconds: 10 });
    expect(computeBpmWindow(40)).toEqual({ seekSeconds: 0, durationSeconds: 30 });
    expect(computeBpmWindow(60)).toEqual({ seekSeconds: 10, durationSeconds: 30 });
    expect(computeBpmWindow(180)).toEqual({ seekSeconds: 10, durationSeconds: 30 });
  });

  it("9. BPM Timestep: reports the true tempo regardless of PCM sample rate", () => {
    // A 100 BPM click train. At 22050 Hz the library's default 10 ms timestep
    // would double the reported tempo to 200.
    const sampleRate = 22050;
    const periodSamples = Math.round((60 / 100) * sampleRate);
    const total = Math.round(30 * sampleRate);
    const pcm = new Float32Array(total);
    for (let i = 0; i < total; i += periodSamples) {
      pcm[i] = 1;
      if (i + 1 < total) pcm[i + 1] = -1;
    }

    const bpm = detectBpmFromPcm(pcm, sampleRate);
    expect(bpm).toBe(100);
  });

  it("10. PCM Decoding: reinterprets raw bytes as 32-bit floats", () => {
    const source = Float32Array.from([0.25, -0.5, 0.75]);
    const bytes = Buffer.from(source.buffer);
    const decoded = bufferToFloat32(bytes);
    expect(decoded.length).toBe(3);
    expect(decoded[0]).toBeCloseTo(0.25, 5);
    expect(decoded[2]).toBeCloseTo(0.75, 5);
  });

  it("11. Complete Audio Analysis: aggregates specs, loudness, and waveform", async () => {
    const analysis = await analyzeAudio(sampleWavPath);
    expect(analysis.durationSeconds).toBe(10);
    expect(analysis.specs.channels).toBe(2);
    expect(analysis.loudness?.integratedLufs).toBeDefined();
    expect(analysis.waveform?.length).toBe(100);
    // The measured loudness must be a real reading, not the -14.0 fallback.
    expect(analysis.loudness?.integratedLufs).toBeCloseTo(-21.8, 1);
  });

  it("12. Single-Pass HLS Transcoder: outputs master playlist and 3 variants (128k, 192k, 320k)", async () => {
    const result = await transcodeToHls(sampleWavPath, hlsOutputDir, {
      segmentDurationSeconds: 4,
    });

    expect(result.masterPlaylistPath).toBeTruthy();
    expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);
    expect(result.variantCount).toBe(3);

    // Verify directory contents
    const masterContent = fs.readFileSync(result.masterPlaylistPath, "utf-8");
    expect(masterContent).toContain("#EXTM3U");
    expect(masterContent).toContain("128k/index.m3u8");
    expect(masterContent).toContain("192k/index.m3u8");
    expect(masterContent).toContain("320k/index.m3u8");

    // Verify sub-variants and .ts segments
    expect(fs.existsSync(path.join(hlsOutputDir, "128k", "index.m3u8"))).toBe(true);
    expect(fs.existsSync(path.join(hlsOutputDir, "192k", "index.m3u8"))).toBe(true);
    expect(fs.existsSync(path.join(hlsOutputDir, "320k", "index.m3u8"))).toBe(true);

    const chunk128 = fs.readdirSync(path.join(hlsOutputDir, "128k"));
    const tsFiles = chunk128.filter((f) => f.endsWith(".ts"));
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it("13. Fused Pipeline: encodes HLS and measures the track in one pass", async () => {
    const result = await transcodeSong(sampleWavPath, fusedHlsDir, {
      artifactsDir: fusedArtifactsDir,
      segmentDurationSeconds: 4,
    });

    expect(result.variantCount).toBe(3);
    expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);
    expect(fs.existsSync(path.join(fusedHlsDir, "128k", "index.m3u8"))).toBe(true);
    expect(fs.existsSync(path.join(fusedHlsDir, "320k", "index.m3u8"))).toBe(true);

    // The analysis artifacts must match what the standalone pipeline produces.
    expect(result.analysis.durationSeconds).toBe(10);
    expect(result.analysis.loudness?.integratedLufs).toBeCloseTo(-21.8, 1);
    expect(result.analysis.waveform?.length).toBe(100);
    expect(result.analysis.energy).toBeGreaterThan(0);
  });

  it("14. Database Schema: supports audioAnalysis JSONB persistence", async () => {
    // Fetch an existing artist profile to satisfy foreign key constraint
    const artistResult = await db.execute<{ id: string }>(
      "SELECT id FROM artist_profiles LIMIT 1"
    );
    const validArtistId = (artistResult as unknown as Array<{ id: string }>)[0]?.id;

    if (!validArtistId) {
      console.warn("Skipping DB test: no artist profiles found in database");
      return;
    }

    const testSongId = crypto.randomUUID();

    // Verify DB can insert and read audioAnalysis JSONB
    const sampleAnalysis = {
      durationSeconds: 180,
      specs: { format: "flac", sampleRate: 48000, channels: 2 },
      loudness: { integratedLufs: -14.2, truePeakDbfs: -0.8, loudnessRangeLu: 6.5 },
      waveform: [0.1, 0.5, 0.9, 0.2],
      musical: { bpm: 124, key: "C# Min" },
    };

    // Test JSON serialization & update
    const [inserted] = await db
      .insert(songs)
      .values({
        id: testSongId,
        artistId: validArtistId,
        title: "Transcoder Test Track",
        slug: `transcoder-test-${Date.now()}`,
        durationSeconds: 180,
        processingStatus: "READY",
        hlsManifestUrl: `https://cdn.groovy.stream/audio/hls/${testSongId}/master.m3u8`,
        audioAnalysis: sampleAnalysis,
      })
      .returning();

    expect(inserted.id).toBe(testSongId);
    expect(inserted.processingStatus).toBe("READY");
    expect(inserted.audioAnalysis).toBeDefined();
    expect(inserted.audioAnalysis?.loudness?.integratedLufs).toBe(-14.2);
    expect(inserted.audioAnalysis?.musical?.bpm).toBe(124);

    // Clean up test song
    await db.delete(songs).where(eq(songs.id, testSongId));
  });
});
