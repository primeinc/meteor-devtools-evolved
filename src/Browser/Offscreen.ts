// Runs in an offscreen document (has DOM + URL APIs)
const URL_REVOKE_DELAY_MS = 10_000 // 10 seconds

chrome.runtime.onMessage.addListener(async (msg, _sender, _sendResponse) => {
  if (msg?.type !== 'OFFSCREEN_DOWNLOAD') return
  try {
    const { filename, mime, base64 } = msg.payload as {
      filename: string
      mime: string
      base64: string
    }
    // Use fetch API for efficient base64 -> Blob conversion
    // This offloads decoding to browser's optimized implementation
    const blob = await (
      await fetch(`data:${mime || 'application/octet-stream'};base64,${base64}`)
    ).blob()
    const url = URL.createObjectURL(blob)
    chrome.downloads.download({ url, filename, saveAs: false }, id => {
      setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS)
      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_DOWNLOAD_DONE',
        payload: { id },
      })
    })
  } catch (e) {
    console.error('[Offscreen] download failed', e)
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_ERROR',
      payload: { message: String(e) },
    })
  }
})
