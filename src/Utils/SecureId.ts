/**
 * Cryptographically secure ID and token generation utilities
 * Addresses Gemini Code Assist CRITICAL security issue:
 * - Math.random() is NOT cryptographically secure
 * - Must use crypto.getRandomValues() for security-sensitive tokens
 */

/**
 * Generate a cryptographically secure random string
 * @param length Number of random bytes (default 16)
 * @returns Hex-encoded random string
 */
export function generateSecureRandomString(length = 16): string {
  const arr = new Uint8Array(length)
  globalThis.crypto.getRandomValues(arr)
  return Array.from(arr, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate a cryptographically secure UUID
 * Uses crypto.randomUUID() if available, falls back to secure random hex string
 * @returns UUID string
 */
export function generateSecureUUID(): string {
  if ((globalThis.crypto as any)?.randomUUID) {
    return (globalThis.crypto as any).randomUUID()
  }
  // Fallback: generate secure random hex string
  return `${generateSecureRandomString(8)}-${generateSecureRandomString(4)}-${generateSecureRandomString(4)}-${generateSecureRandomString(4)}-${generateSecureRandomString(12)}`
}

/**
 * Generate a secure transfer ID with prefix
 */
export function generateTransferId(): string {
  return `dl-${generateSecureRandomString()}`
}

/**
 * Generate a secure authentication token with prefix
 */
export function generateAuthToken(): string {
  return `tok-${generateSecureRandomString()}`
}

/**
 * Generate a secure client instance ID with prefix
 */
export function generateClientInstanceId(): string {
  return `client-${generateSecureRandomString()}`
}
