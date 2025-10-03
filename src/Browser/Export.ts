/**
 * Offscreen document for handling downloads in Chrome MV3.
 *
 * This offscreen document is used to properly handle file downloads
 * with correct filenames in Chrome MV3, as service workers cannot
 * directly use chrome.downloads API with blob URLs.
 */

interface DownloadMessage {
  type: 'download'
  data: {
    content: string
    filename: string
    mimeType?: string
  }
}

type OffscreenMessage = DownloadMessage

/**
 * Handle download requests by creating a blob and using chrome.downloads API
 */
function handleDownload(message: DownloadMessage['data']) {
  const { content, filename, mimeType = 'application/json' } = message

  // Create blob from content
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  // Use chrome.downloads API to save the file with proper filename
  chrome.downloads.download(
    {
      url: url,
      filename: filename,
      saveAs: false,
    },
    downloadId => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError)
      } else {
        console.log('Download started:', downloadId)
      }

      // Clean up the blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  )
}

/**
 * Listen for messages from the service worker
 */
chrome.runtime.onMessage.addListener(
  (message: OffscreenMessage, sender, sendResponse) => {
    if (message.type === 'download') {
      try {
        handleDownload(message.data)
        sendResponse({ success: true })
      } catch (error) {
        console.error('Error handling download:', error)
        sendResponse({ success: false, error: String(error) })
      }
      return true // Keep the message channel open for async response
    }
  },
)

console.log('Offscreen document ready for downloads')
