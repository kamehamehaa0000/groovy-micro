import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface RecordedRequest {
  method: string;
  path: string;
  contentType?: string;
  cacheControl?: string;
  contentLength?: string;
  transferEncoding?: string;
  checksum?: string;
  bodyLength: number;
  body: Buffer;
}

const recorded: RecordedRequest[] = [];
/** Minimal object store so the download path can be exercised. */
const objects = new Map<string, Buffer>();
let server: ReturnType<typeof Bun.serve> | null = null;
let testDir = "";

describe("R2 upload pipeline (mock S3 endpoint)", () => {
  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `groovy-r2-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const body = Buffer.from(await request.arrayBuffer());
        recorded.push({
          method: request.method,
          path: url.pathname,
          contentType: request.headers.get("content-type") ?? undefined,
          cacheControl: request.headers.get("cache-control") ?? undefined,
          contentLength: request.headers.get("content-length") ?? undefined,
          transferEncoding: request.headers.get("transfer-encoding") ?? undefined,
          checksum: request.headers.get("x-amz-checksum-crc32") ?? undefined,
          bodyLength: body.length,
          body,
        });

        if (request.method === "PUT") {
          objects.set(url.pathname, body);
          return new Response(null, { status: 200 });
        }
        if (request.method === "GET") {
          const stored = objects.get(url.pathname);
          if (!stored) {
            return new Response("Not Found", { status: 404 });
          }
          return new Response(new Uint8Array(stored), { status: 200 });
        }
        return new Response(null, { status: 405 });
      },
    });

    // The S3 client reads its endpoint from config at import time, so the
    // override has to be in place before the module is loaded.
    process.env.R2_ENDPOINT = `http://127.0.0.1:${server.port}`;
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  });

  afterAll(() => {
    server?.stop(true);
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("streams a directory of HLS segments to the object store", async () => {
    const { uploadHlsDirectory, downloadRawAudio } = await import(
      "../src/storage/r2"
    );

    const sourceDir = path.join(testDir, "hls");
    fs.mkdirSync(path.join(sourceDir, "128k"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "192k"), { recursive: true });

    const segment = Buffer.alloc(64 * 1024, 7);
    fs.writeFileSync(path.join(sourceDir, "128k", "index0.ts"), segment);
    fs.writeFileSync(path.join(sourceDir, "192k", "index0.ts"), segment);
    fs.writeFileSync(
      path.join(sourceDir, "master.m3u8"),
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\n128k/index.m3u8\n"
    );

    recorded.length = 0;
    const { uploadedKeys } = await uploadHlsDirectory(sourceDir, "audio/hls/song-1");

    expect(uploadedKeys.length).toBe(3);
    expect(uploadedKeys).toContain("audio/hls/song-1/master.m3u8");
    expect(uploadedKeys).toContain("audio/hls/song-1/128k/index0.ts");

    // Every object must be sent with a real Content-Length and never chunked:
    // R2 rejects PutObject requests that use Transfer-Encoding: chunked.
    for (const req of recorded) {
      expect(req.method).toBe("PUT");
      expect(req.transferEncoding).toBeUndefined();
      expect(req.contentLength).toBeDefined();
      expect(Number(req.contentLength)).toBe(req.bodyLength);
    }

    // Media segments are immutable and cached for a year.
    const tsRequest = recorded.find((r) => r.path.endsWith(".ts"))!;
    expect(tsRequest.contentType).toBe("video/MP2T");
    expect(tsRequest.cacheControl).toBe("public, max-age=31536000, immutable");
    expect(tsRequest.bodyLength).toBe(segment.length);
    expect(tsRequest.body.equals(segment)).toBe(true);

    // Playlists are revalidated more often.
    const m3u8Request = recorded.find((r) => r.path.endsWith(".m3u8"))!;
    expect(m3u8Request.contentType).toBe("application/vnd.apple.mpegurl");
    expect(m3u8Request.cacheControl).toBe("public, max-age=86400");

    // And the download path still round-trips.
    objects.set("/test-bucket/audio/raw/song-1.flac", Buffer.from("raw-audio"));
    const destination = path.join(testDir, "downloaded.bin");
    await downloadRawAudio("audio/raw/song-1.flac", destination);
    expect(fs.existsSync(destination)).toBe(true);
    expect(fs.readFileSync(destination, "utf-8")).toBe("raw-audio");
  });
});
