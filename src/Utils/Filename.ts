/**
 * Filename sanitization utility for safe cross-platform file downloads
 */

const INVALID = /[\0\\/:*?"<>|]/g
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 *
 */
export function sanitizeFilename(base: string): string {
  let b = (base || 'collection').trim().replace(INVALID, '_')
  if (RESERVED.test(b)) b = `_${b}`
  b = b.replace(/\.+$/, '')
  if (b.length > 200) b = b.slice(0, 200)
  return b
}
