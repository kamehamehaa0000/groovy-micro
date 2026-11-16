import { spawn } from "node:child_process";

/**
 * Options for a single external process invocation.
 */
export interface ProcessRunOptions {
  /** Hard wall-clock budget in milliseconds. `0` disables the timeout. */
  timeoutMs?: number;
  /** Cooperative cancellation signal. */
  signal?: AbortSignal;
  /** Collect stdout into a Buffer. */
  captureStdout?: boolean;
  /** Abort if stdout grows beyond this many bytes. */
  maxStdoutBytes?: number;
  /** Keep at most this many bytes of stderr (the tail is preserved). */
  maxStderrBytes?: number;
}

export interface ProcessRunResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
}

/** Raised when a process exceeds its `timeoutMs` budget and is terminated. */
export class ProcessTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(binary: string, timeoutMs: number) {
    super(`Process "${binary}" exceeded its ${timeoutMs}ms timeout and was terminated`);
    this.name = "ProcessTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Raised when a process is terminated because its AbortSignal fired. */
export class ProcessAbortedError extends Error {
  constructor(binary: string, reason?: string) {
    super(`Process "${binary}" was aborted${reason ? `: ${reason}` : ""}`);
    this.name = "ProcessAbortedError";
  }
}

const DEFAULT_MAX_STDOUT_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 4 * 1024 * 1024;

/**
 * Spawns an external binary and resolves with its output.
 *
 * Replaces the previous `spawnSync` usage: the event loop is never blocked, so
 * BullMQ keeps renewing the job lock and emitting heartbeats while FFmpeg runs.
 * Every invocation is bounded by a timeout and can be cancelled via AbortSignal.
 */
export function runProcess(
  binary: string,
  args: string[],
  options: ProcessRunOptions = {}
): Promise<ProcessRunResult> {
  const {
    timeoutMs = 0,
    signal,
    captureStdout = true,
    maxStdoutBytes = DEFAULT_MAX_STDOUT_BYTES,
    maxStderrBytes = DEFAULT_MAX_STDERR_BYTES,
  } = options;

  if (signal?.aborted) {
    return Promise.reject(
      new ProcessAbortedError(binary, (signal.reason as Error | undefined)?.message)
    );
  }

  return new Promise<ProcessRunResult>((resolve, reject) => {
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stderrText = "";
    let timer: NodeJS.Timeout | undefined;

    const stdoutChunks: Buffer[] = [];
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });

    function onAbort() {
      terminate(
        new ProcessAbortedError(binary, (signal?.reason as Error | undefined)?.message)
      );
    }

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      signal?.removeEventListener("abort", onAbort);
    }

    function terminate(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        child.kill("SIGKILL");
      } catch {
        // Process already exited.
      }
      reject(error);
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        terminate(new ProcessTimeoutError(binary, timeoutMs));
      }, timeoutMs);
      timer.unref?.();
    }

    child.stdout.on("data", (chunk: Buffer) => {
      if (!captureStdout) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        terminate(
          new Error(
            `Process "${binary}" wrote more than ${maxStdoutBytes} bytes to stdout`
          )
        );
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderrText += chunk.toString("utf8");
      if (stderrBytes > maxStderrBytes) {
        // Keep the tail: FFmpeg prints the ebur128 summary last.
        stderrText = stderrText.slice(-maxStderrBytes);
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Failed to spawn "${binary}": ${(err as Error).message}`));
    });

    child.on("close", (code, sig) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code !== 0) {
        reject(
          new Error(
            `"${binary}" exited with ${
              sig ? `signal ${sig}` : `code ${code}`
            }: ${stderrText.trim() || "no stderr output"}`
          )
        );
        return;
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: stderrText,
        exitCode: code ?? 0,
      });
    });
  });
}
