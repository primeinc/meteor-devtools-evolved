// Runs in an offscreen document (has DOM + URL APIs)
chrome.runtime.onMessage.addListener(async (msg, _sender, _sendResponse) => {
  if (msg?.type !== 'OFFSCREEN_DOWNLOAD') return
  try {
    const { filename, mime, base64 } = msg.payload as {
      filename: string
      mime: string
      base64: string
    }
    // Convert base64 -> Uint8Array
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    chrome.downloads.download({ url, filename, saveAs: false }, id => {
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
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
