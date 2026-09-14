import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execSync } from "node:child_process";
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
} from "../src/transcoder/audio-analyzer";
import { transcodeToHls } from "../src/transcoder/ffmpeg";
import { db, songs } from "../src/lib/db";
import { eq } from "drizzle-orm";

describe("Media Transcoder Worker Test Suite", () => {
  const testDir = path.join(os.tmpdir(), `groovy-test-${Date.now()}`);
  const sampleWavPath = path.join(testDir, "test_sample.wav");
  const hlsOutputDir = path.join(testDir, "hls_output");

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });

    // Generate a 10-second 440Hz stereo audio tone using FFmpeg for testing
    const { ffmpegPath } = resolveFfmpeg();
    execSync(
      `"${ffmpegPath}" -v error -y -f lavfi -i "sine=frequency=440:duration=10" -ac 2 -ar 44100 "${sampleWavPath}"`
    );
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

  it("2. Probe Audio: extracts duration, channels, sample rate, and format", () => {
    const probe = probeAudio(sampleWavPath);
    expect(probe.durationSeconds).toBe(10);
    expect(probe.sampleRate).toBe(44100);
    expect(probe.channels).toBe(2);
    expect(probe.format).toBe("wav");
  });

  it("3. Loudness Analysis: extracts EBU R128 metrics (LUFS & True Peak)", () => {
    const loudness = extractLoudness(sampleWavPath);
    expect(typeof loudness.integratedLufs).toBe("number");
    expect(typeof loudness.truePeakDbfs).toBe("number");
    expect(typeof loudness.loudnessRangeLu).toBe("number");
    // Standard pure sine tone is ~ -21.8 LUFS
    expect(loudness.integratedLufs).toBeLessThan(-10);
  });

  it("4. Waveform Extraction: produces 100 normalized peak points (0.0 - 1.0)", () => {
    const waveform = extractWaveform(sampleWavPath, 100);
    expect(waveform).toBeArray();
    expect(waveform.length).toBe(100);

    const maxVal = Math.max(...waveform);
    const minVal = Math.min(...waveform);
    expect(maxVal).toBeLessThanOrEqual(1.0);
    expect(minVal).toBeGreaterThanOrEqual(0.0);
  });

  it("5. BPM Detection: handles audio samples gracefully", () => {
    const bpm = detectBpm(sampleWavPath, 10);
    // Sine tone has no beats, so should return undefined or a fallback
    expect(bpm === undefined || typeof bpm === "number").toBe(true);
  });

  it("6. Complete Audio Analysis: aggregates specs, loudness, and waveform", () => {
    const analysis = analyzeAudio(sampleWavPath);
    expect(analysis.durationSeconds).toBe(10);
    expect(analysis.specs.channels).toBe(2);
    expect(analysis.loudness?.integratedLufs).toBeDefined();
    expect(analysis.waveform?.length).toBe(100);
  });

  it("7. Single-Pass HLS Transcoder: outputs master playlist and 3 variants (128k, 192k, 320k)", async () => {
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

  it("8. Database Schema: supports audioAnalysis JSONB persistence", async () => {
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
