import * as nodeArgon2 from "@node-rs/argon2";

// Detect if Bun's native C++ password hashing is available
const isBunRuntime =
  typeof Bun !== "undefined" &&
  typeof Bun.password !== "undefined" &&
  typeof Bun.password.hash === "function";

/**
 * Standard OWASP-recommended Argon2id parameters:
 * - memoryCost: 64 MB (65536 KiB)
 * - timeCost: 3 iterations
 */
const ARGON2_CONFIG = {
  memoryCost: 65536,
  timeCost: 3,
};

/**
 * Hashes a password using Argon2id with automatic runtime abstraction:
 * - Uses Bun.password.hash (native C++) when running under Bun
 * - Falls back cleanly to @node-rs/argon2 (prebuilt Rust binary) on Node.js
 */
export async function hashPassword(password: string): Promise<string> {
  if (isBunRuntime) {
    return await Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: ARGON2_CONFIG.memoryCost,
      timeCost: ARGON2_CONFIG.timeCost,
    });
  }

  return await nodeArgon2.hash(password, {
    algorithm: 2, // Argon2id
    memoryCost: ARGON2_CONFIG.memoryCost,
    timeCost: ARGON2_CONFIG.timeCost,
  });
}

/**
 * Verifies a plaintext password against an Argon2id PHC string.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!hash || !password) return false;

  try {
    if (isBunRuntime) {
      return await Bun.password.verify(password, hash);
    }

    return await nodeArgon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Pre-computed valid Argon2id hash used to perform dummy verification in constant time.
 * Prevents user enumeration via response latency timing attacks.
 */
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$9b/mQ7NvZ07vJqVz3021H1j9Qn8zT6W1rO2y3L4k5J6";

export async function runDummyPasswordCheck(): Promise<void> {
  try {
    await verifyPassword("invalid-timing-prevention-password", DUMMY_ARGON2_HASH);
  } catch {
    // Swallow any errors
  }
}
