import browser from 'webextension-polyfill'

/**
 * Trigger a download by sending a message to the background script,
 * which will forward it to the offscreen document for processing.
 *
 * @param content - The content to download (typically JSON stringified data)
 * @param filename - The desired filename for the download
 * @param mimeType - The MIME type of the content (defaults to 'application/json')
 */
export const triggerDownload = async (
  content: string,
  filename: string,
  mimeType: string = 'application/json',
): Promise<void> => {
  try {
    await browser.runtime.sendMessage({
      eventType: 'download',
      source: 'meteor-devtools-evolved',
      data: {
        content,
        filename,
        mimeType,
      },
    })
  } catch (error) {
    console.error('Failed to trigger download:', error)
    throw error
  }
}

/**
 * Export data as JSON file
 *
 * @param data - The data to export (will be JSON stringified)
 * @param filename - The desired filename (without extension)
 */
export const exportToJSON = async (
  data: any,
  filename: string,
): Promise<void> => {
  const content = JSON.stringify(data, null, 2)
  const fullFilename = filename.endsWith('.json')
    ? filename
    : `${filename}.json`
  return triggerDownload(content, fullFilename, 'application/json')
}

/**
 * Export collection data as JSON
 *
 * @param collectionName - Name of the collection
 * @param data - The collection data to export
 */
export const exportCollectionToJSON = async (
  collectionName: string,
  data: any[],
): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${collectionName}_${timestamp}.json`
  return exportToJSON(data, filename)
}

/**
 * Export DDP logs as JSON
 *
 * @param logs - The DDP logs to export
 */
export const exportDDPLogs = async (logs: any[]): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `ddp_logs_${timestamp}.json`
  return exportToJSON(logs, filename)
}
