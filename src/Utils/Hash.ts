/**
 * Cryptographic hash utilities using Web Crypto API
 */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const arr = new Uint8Array(digest)
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
