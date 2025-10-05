/**
 * Filename sanitization utility for safe cross-platform file downloads
 */

const INVALID = /[\0\\/:*?"<>|]/g
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * Sanitizes a filename for safe cross-platform file downloads.
 * Removes invalid characters, handles reserved names, and limits length.
 *
 * @param base - The filename to sanitize
 * @returns Sanitized filename safe for all platforms
 */
export function sanitizeFilename(base: string): string {
  let b = (base || 'collection').trim().replace(INVALID, '_')
  if (RESERVED.test(b)) b = `_${b}`
  b = b.replace(/\.+$/, '')
  if (b.length > 200) b = b.slice(0, 200)
  return b
}
