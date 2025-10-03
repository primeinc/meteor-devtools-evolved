const MAX_RETRY = 3
const CHUNK = 1 * 1024 * 1024
const ACK_TIMEOUT_MS = 5000

export class RelayClient {
  private port: chrome.runtime.Port
  private failureListener: ((m: any) => void) | null = null

  constructor() {
    this.port = chrome.runtime.connect({ name: 'export-relay' })
    console.log('[RelayClient] Connected to background via port')
  }

  private waitAck(match: (m:any)=>boolean) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('ACK timeout')) }, ACK_TIMEOUT_MS)
      const on = (m:any) => {
        // Check for EXPORT_FAILED first
        if (m?.type === 'EXPORT_FAILED') {
          clearTimeout(t)
          off()
          reject(new Error(`Export failed: ${m.payload?.reason || 'Unknown error'}`))
          return
        }
        if (match(m)) { clearTimeout(t); off(); resolve() }
      }
      const off = () => this.port.onMessage.removeListener(on)
      this.port.onMessage.addListener(on)
    })
  }

  private async reqAck(msg: any, matcher: (m:any)=>boolean) {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      this.port.postMessage(msg)
      try { await this.waitAck(matcher); return } catch (e) { if (attempt === MAX_RETRY) throw e }
    }
  }

  async sendBlob(blob: Blob, filename: string, mime: string, expectedHash: string, signal: AbortSignal, onProgress: (p:number)=>void) {
    const id =
      (globalThis.crypto as any)?.randomUUID?.() ??
      `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`
    console.log('[RelayClient] Starting transfer:', { id, filename, blobSize: blob.size, mime, expectedHash })

    // Send ABORT message if signal is aborted
    signal.addEventListener('abort', () => {
      try {
        console.log('[RelayClient] Abort signal received, sending ABORT message')
        this.port.postMessage({ type:'EXPORT_DOWNLOAD_ABORT', payload:{ id } })
      } catch (e) {
        console.warn('[RelayClient] Failed to send ABORT:', e)
      }
    })

    await this.reqAck({ type:'EXPORT_DOWNLOAD_BEGIN', payload:{ id, filename, mime, expectedHash } }, (m)=> m?.type==='EXPORT_ACK' && m.payload?.id===id && m.payload?.type==='BEGIN')
    console.log('[RelayClient] BEGIN acknowledged')

    const buf = new Uint8Array(await blob.arrayBuffer())
    const total = Math.ceil(buf.byteLength/CHUNK)
    console.log('[RelayClient] Buffer size:', buf.byteLength, 'chunks:', total, 'first 4 bytes:', Array.from(buf.slice(0, 4)))

    for (let idx = 0; idx < total; idx++) {
      if (signal.aborted) throw new DOMException('aborted','AbortError')
      const start = idx * CHUNK
      const end = Math.min(buf.byteLength, start + CHUNK)
      const chunk = buf.subarray(start, end)
      const bytesArray = Array.from(chunk)
      console.log(`[RelayClient] Sending chunk ${idx+1}/${total}, size: ${bytesArray.length}, first 4 bytes:`, bytesArray.slice(0, 4))

      await this.reqAck(
        { type:'EXPORT_DOWNLOAD_CHUNK', payload:{ id, idx, bytes: bytesArray } },
        (m)=> m?.type==='EXPORT_ACK' && m.payload?.id===id && m.payload?.type==='CHUNK' && m.payload?.idx===idx
      )
      onProgress((idx + 1) / total)
    }

    console.log('[RelayClient] Sending END signal')
    await this.reqAck({ type:'EXPORT_DOWNLOAD_END', payload:{ id } }, (m)=> m?.type==='EXPORT_ACK' && m.payload?.id===id && m.payload?.type==='END')
    console.log('[RelayClient] Transfer complete')
  }
}