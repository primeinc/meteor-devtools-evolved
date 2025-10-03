import browser from 'webextension-polyfill'

const CHUNK_SIZE = 100 * 1024 // 100KB chunks

/**
 * Generates a cryptographically secure random token
 */
export const generateExportToken = (): string => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Checks if offscreen document exists
 */
const hasOffscreenDocument = async (): Promise<boolean> => {
  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    })
    return contexts.length > 0
  }
  return false
}

/**
 * Creates offscreen document if it doesn't exist
 */
const createOffscreenDocument = async (): Promise<void> => {
  if (await hasOffscreenDocument()) {
    return
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS' as chrome.offscreen.Reason],
    justification: 'Export large datasets without blocking service worker',
  })
}

/**
 * Exports data in chunks to offscreen document with abort support
 */
export class SecureExporter {
  private token: string
  private aborted: boolean = false

  constructor() {
    this.token = generateExportToken()
  }

  /**
   * Aborts the current export
   */
  abort(): void {
    if (this.aborted) return

    this.aborted = true
    browser.runtime.sendMessage({
      type: 'export-abort',
      token: this.token,
    })
  }

  /**
   * Exports data in secure chunks
   */
  async export(data: any, filename: string): Promise<void> {
    if (this.aborted) {
      throw new Error('Export was aborted')
    }

    // Ensure offscreen document exists
    await createOffscreenDocument()

    // Convert data to JSON string
    const jsonString = JSON.stringify(data, null, 2)
    const totalSize = jsonString.length
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE)

    console.debug(
      `Starting export: ${filename}, size: ${totalSize} bytes, chunks: ${totalChunks}`,
    )

    // Send init message
    await browser.runtime.sendMessage({
      type: 'export-init',
      token: this.token,
      filename,
      totalChunks,
    })

    // Check if aborted before starting chunks
    if (this.aborted) {
      throw new Error('Export was aborted')
    }

    // Send chunks with delay to prevent memory spikes
    for (let i = 0; i < totalChunks; i++) {
      if (this.aborted) {
        throw new Error('Export was aborted')
      }

      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, totalSize)
      const chunk = jsonString.substring(start, end)

      await browser.runtime.sendMessage({
        type: 'export-chunk',
        token: this.token,
        chunkIndex: i,
        totalChunks,
        data: chunk,
        isLast: i === totalChunks - 1,
      })

      // Small delay between chunks to allow garbage collection
      if (i < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      console.debug(`Sent chunk ${i + 1}/${totalChunks}`)
    }

    console.debug('Export complete')
  }

  /**
   * Gets the current token
   */
  getToken(): string {
    return this.token
  }

  /**
   * Checks if export was aborted
   */
  isAborted(): boolean {
    return this.aborted
  }
}

/**
 * Convenience function to export data
 */
export const exportData = async (
  data: any,
  filename: string,
): Promise<SecureExporter> => {
  const exporter = new SecureExporter()
  try {
    await exporter.export(data, filename)
  } catch (error) {
    if (!exporter.isAborted()) {
      throw error
    }
  }
  return exporter
}
