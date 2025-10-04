import { createLogger } from '@/Utils/Logger'
import {
  generateTransferId,
  generateAuthToken,
  generateClientInstanceId,
} from '@/Utils/SecureId'

const logger = createLogger('RelayClient')

const MAX_RETRY = 3
const CHUNK = 1 * 1024 * 1024
const ACK_TIMEOUT_MS = 5000
const BACKPRESSURE_BASE_DELAY_MS = 100
const BACKPRESSURE_MAX_DELAY_MS = 2000
const MAX_BACKPRESSURE_RETRIES = 10 // Cap to prevent Math.pow overflow (2^10 = 1024ms base)

/**
 * Calculate exponential backoff delay with capping to prevent overflow
 * @param retryCount Number of retry attempts
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(retryCount: number): number {
  const cappedRetryCount = Math.min(retryCount, MAX_BACKPRESSURE_RETRIES)
  return Math.min(
    BACKPRESSURE_BASE_DELAY_MS * Math.pow(2, cappedRetryCount),
    BACKPRESSURE_MAX_DELAY_MS,
  )
}

export class RelayClient {
  private port: chrome.runtime.Port
  private failureListener: ((m: any) => void) | null = null
  private clientInstanceId: string

  constructor() {
    this.port = chrome.runtime.connect({ name: 'export-relay' })
    // Generate a cryptographically secure client instance ID
    this.clientInstanceId = generateClientInstanceId()
    logger.debug(
      'Connected to background via port, clientInstanceId:',
      this.clientInstanceId,
    )
  }

  private waitAck(match: (m: any) => boolean, backpressureRetry?: number) {
    return new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => {
        off()
        reject(new Error('ACK timeout'))
      }, ACK_TIMEOUT_MS)
      const on = (m: any) => {
        // Check for EXPORT_FAILED first
        if (m?.type === 'EXPORT_FAILED') {
          clearTimeout(t)
          off()
          reject(
            new Error(`Export failed: ${m.payload?.reason || 'Unknown error'}`),
          )
          return
        }
        // Handle backpressure with exponential backoff
        if (m?.type === 'EXPORT_BACKPRESSURE') {
          clearTimeout(t)
          off()
          const retryCount = backpressureRetry ?? 0
          const delay = calculateBackoffDelay(retryCount)
          logger.debug(
            `Backpressure received, retrying in ${delay}ms (attempt ${retryCount + 1})`,
          )
          reject({ isBackpressure: true, retryCount, delay })
          return
        }
        if (match(m)) {
          clearTimeout(t)
          off()
          resolve(m.payload)
        }
      }
      const off = () => this.port.onMessage.removeListener(on)
      this.port.onMessage.addListener(on)
    })
  }

  private async reqAck(msg: any, matcher: (m: any) => boolean) {
    let backpressureRetry = 0
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      this.port.postMessage(msg)
      try {
        const payload = await this.waitAck(matcher, backpressureRetry)
        return payload
      } catch (e: any) {
        // Handle backpressure with exponential backoff
        if (e?.isBackpressure) {
          await new Promise(resolve => setTimeout(resolve, e.delay))
          backpressureRetry = e.retryCount + 1
          // Don't count backpressure as a retry attempt
          attempt--
          continue
        }
        if (attempt === MAX_RETRY) throw e
      }
    }
  }

  async sendBlob(
    blob: Blob,
    filename: string,
    mime: string,
    expectedHash: string,
    signal: AbortSignal,
    onProgress: (p: number) => void,
  ) {
    // Generate cryptographically secure ID and token
    const id = generateTransferId()
    const token = generateAuthToken()
    logger.info('Starting transfer:', {
      id,
      filename,
      blobSize: blob.size,
      mime,
      expectedHash,
      token,
    })

    // Send ABORT message if signal is aborted
    signal.addEventListener('abort', () => {
      try {
        logger.info('Abort signal received, sending ABORT message')
        this.port.postMessage({
          type: 'EXPORT_DOWNLOAD_ABORT',
          payload: { id, token, clientInstanceId: this.clientInstanceId },
        })
      } catch (e) {
        logger.warn('Failed to send ABORT:', e)
      }
    })

    const beginResp = await this.reqAck(
      {
        type: 'EXPORT_DOWNLOAD_BEGIN',
        payload: {
          id,
          filename,
          mime,
          expectedHash,
          token,
          clientInstanceId: this.clientInstanceId,
        },
      },
      m =>
        m?.type === 'EXPORT_ACK' &&
        m.payload?.id === id &&
        m.payload?.type === 'BEGIN',
    )
    logger.debug('BEGIN acknowledged, token:', beginResp)

    const buf = new Uint8Array(await blob.arrayBuffer())
    const total = Math.ceil(buf.byteLength / CHUNK)
    logger.debug(
      'Buffer size:',
      buf.byteLength,
      'chunks:',
      total,
      'first 4 bytes:',
      Array.from(buf.slice(0, 4)),
    )

    for (let idx = 0; idx < total; idx++) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const start = idx * CHUNK
      const end = Math.min(buf.byteLength, start + CHUNK)
      const chunk = buf.subarray(start, end)
      const bytesArray = Array.from(chunk)
      logger.debug(
        `Sending chunk ${idx + 1}/${total}, size: ${
          bytesArray.length
        }, first 4 bytes:`,
        bytesArray.slice(0, 4),
      )

      await this.reqAck(
        {
          type: 'EXPORT_DOWNLOAD_CHUNK',
          payload: {
            id,
            idx,
            bytes: bytesArray,
            token,
            clientInstanceId: this.clientInstanceId,
          },
        },
        m =>
          m?.type === 'EXPORT_ACK' &&
          m.payload?.id === id &&
          m.payload?.type === 'CHUNK' &&
          m.payload?.idx === idx,
      )
      onProgress((idx + 1) / total)
    }

    logger.debug('Sending END signal')
    await this.reqAck(
      {
        type: 'EXPORT_DOWNLOAD_END',
        payload: { id, token, clientInstanceId: this.clientInstanceId },
      },
      m =>
        m?.type === 'EXPORT_ACK' &&
        m.payload?.id === id &&
        m.payload?.type === 'END',
    )
    logger.info('Transfer complete')
  }
}
