/**
 * Cryptographic hash utilities using Web Crypto API
 */

/**
 * Computes SHA-256 hash of bytes and returns as hex string.
 *
 * @param bytes - The bytes to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256Hex(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const arr = new Uint8Array(digest)
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
