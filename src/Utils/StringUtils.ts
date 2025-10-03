import memoize from 'lodash.memoize'

export const isString = (value: any) => typeof value === 'string'

export namespace StringUtils {
  export const classPrefix = 'mde'

  export const truncate = (str: string, max: number = 40) => {
    return isString(str) && str.length > max
      ? str.slice(0, max).concat('...')
      : str
  }

  /**
   * Five levels of brightness from 1 to 5.
   *
   * @param brightness
   */
  export const getRandomColor = (brightness: number) => {
    if (brightness < 1 || brightness > 5)
      throw new Error(
        'Only five brightness levels, from 1 to 5, are acceptable.',
      )

    const variance = 255 / 5

    const getByte = () =>
      Math.round(variance * (brightness - 1) + Math.random() * variance)

    const rgb = [0, 0, 0].map(getByte).join(',')

    return `rgb(${rgb})`
  }

  export const toClipboard = (data: string, mimeType = 'text/plain') => {
    document.oncopy = function (event: ClipboardEvent) {
      event.clipboardData?.setData(mimeType, data)
      event.preventDefault()
    }
    document.execCommand('copy', false)
  }

  export const getSize = memoize((content: string) => new Blob([content]).size)

  /**
   * Windows reserved filenames that need special handling.
   * These names are reserved by Windows and cannot be used as filenames.
   */
  const RESERVED_WINDOWS_NAMES = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ]

  /**
   * Validates and sanitizes a filename by trimming whitespace and checking
   * against reserved Windows filenames.
   * Reserved names are validated AFTER trimming to ensure proper handling.
   *
   * @param filename - The filename to validate
   * @returns Object with validation result and sanitized filename
   */
  export const validateFilename = (
    filename: string,
  ): { isValid: boolean; sanitized: string; error?: string } => {
    if (!isString(filename)) {
      return {
        isValid: false,
        sanitized: '',
        error: 'Filename must be a string',
      }
    }

    // Trim whitespace first, before validation
    const trimmed = filename.trim()

    if (trimmed.length === 0) {
      return {
        isValid: false,
        sanitized: trimmed,
        error: 'Filename cannot be empty',
      }
    }

    // Extract base name without extension for reserved name check
    const baseName = trimmed.split('.')[0].toUpperCase()

    if (RESERVED_WINDOWS_NAMES.includes(baseName)) {
      return {
        isValid: false,
        sanitized: trimmed,
        error: `"${baseName}" is a reserved filename`,
      }
    }

    // Check for invalid characters
    // eslint-disable-next-line no-control-regex
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/
    if (invalidChars.test(trimmed)) {
      return {
        isValid: false,
        sanitized: trimmed,
        error: 'Filename contains invalid characters',
      }
    }

    return {
      isValid: true,
      sanitized: trimmed,
    }
  }

  /**
   * Safely renders text content by ensuring it's treated as text, not HTML.
   * Use this for displaying user-provided or error content to prevent XSS.
   *
   * @param text - The text to sanitize
   * @returns The text, safe for display
   */
  export const sanitizeText = (text: string): string => {
    if (!isString(text)) {
      return String(text)
    }
    // Return as-is for React to handle as textContent
    // React automatically escapes text content, but this function
    // makes the intent explicit and provides a central point for
    // text sanitization if needed in the future
    return text
  }

  export function getPrefixedClass(className) {
    return `${classPrefix}-${className}`
  }
}
