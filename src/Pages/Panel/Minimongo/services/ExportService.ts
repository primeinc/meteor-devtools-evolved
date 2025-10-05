/**
 * ExportService: Core export logic for Minimongo collections
 *
 * Provides:
 * - Multiple export formats (MongoDB, TypeScript, Mongoose, etc.)
 * - Memory-efficient byte assembly for large exports
 * - Port-based relay downloads for cross-context blob transfer
 */

import { ByteAssembler } from './ByteAssembler'
import { sanitizeFilename } from '@/Utils/Filename'
import { flags } from '@/Config/flags'
import { RelayClient } from './RelayClient'
import { createLogger } from '@/Utils/Logger'
import {
  ALL_FORMATS,
  ExportFormat,
  ExportData,
  ExportOptions,
  inferSchema,
} from './MongoExportFormats'

// Re-export for tests
export { inferSchema }

const logger = createLogger('Export')

const CHUNK_SIZE = 500

/**
 *
 */
function sleep0(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 *
 */
function inDevToolsPanel(): boolean {
  // devtools pages use a chrome-extension:// URL but include "devtools" resources
  return (
    location.href.startsWith('chrome-extension://') &&
    /devtools/i.test(document.referrer + ' ' + location.href)
  )
}

/**
 *
 */
async function tryAnchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 *
 */
async function downloadViaRelay(
  blob: Blob,
  filename: string,
  mime: string,
  signal: AbortSignal,
  onProgress: (p: number) => void,
) {
  // Compute checksum for integrity verification
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const { sha256Hex } = await import('@/Utils/Hash')
  const expectedHash = await sha256Hex(bytes)
  logger.debug(
    'Blob hash:',
    expectedHash,
    'size:',
    bytes.byteLength,
    'first 4 bytes:',
    Array.from(bytes.slice(0, 4)),
  )

  const relay = new RelayClient()
  await relay.sendBlob(blob, filename, mime, expectedHash, signal, onProgress)
}

/**
 *
 */
export async function saveBlob(
  blob: Blob,
  filename: string,
  signal: AbortSignal,
  onProgress: (p: number) => void,
) {
  const mime = blob.type || 'application/octet-stream'
  const inPanel = inDevToolsPanel()
  const forceRelay = flags.export.useBackgroundRelay
  logger.info('saveBlob:', {
    filename,
    blobSize: blob.size,
    mime,
    inPanel,
    forceRelay,
    willUseRelay: forceRelay || inPanel,
  })
  const mustRelay = forceRelay || inPanel
  if (mustRelay)
    return downloadViaRelay(blob, filename, mime, signal, onProgress)
  return tryAnchorDownload(blob, filename)
}

export const ExportService = {
  /**
   * Get all available export formats
   */
  getFormats(): ExportFormat[] {
    return ALL_FORMATS
  },

  /**
   * Export collection in specified format
   */
  async exportCollection(
    format: ExportFormat,
    collectionName: string,
    docs: any[],
    onProgress: (p: number, m: string) => void,
    signal: AbortSignal,
    options: ExportOptions = {},
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `${sanitizeFilename(collectionName)}_${
      format.key
    }_${timestamp}.${format.extension}`

    onProgress(0.05, `Generating ${format.name}...`)

    // Prepare export data
    const exportData: ExportData = {
      documents: docs,
      collectionName,
    }

    // Generate formatted output
    // DESIGN TRADEOFF: Generates entire output in memory for code simplicity
    // Previous implementation used ByteAssembler for streaming/chunked generation
    // Current approach:
    //   - PROS: Simpler code, works for most use cases
    //   - CONS: Higher memory usage for very large exports (>250MB)
    //   - MITIGATION: UI shows warning for large exports (see ExportDialog.tsx:125)
    // TODO: Re-evaluate ByteAssembler streaming if large exports become common use case
    const output = format.formatter(exportData, options)

    onProgress(0.9, 'Creating file...')

    // Create blob with correct MIME type
    const blob = new Blob([output], { type: format.mimeType })

    onProgress(0.95, 'Downloading...')

    await saveBlob(blob, name, signal, p =>
      onProgress(0.95 + 0.04 * p, 'Downloading…'),
    )
  },

  /**
   * Legacy: Export collection data as JSON array
   * @deprecated Use exportCollection with MONGO_IMPORT_ARRAY format
   */
  async exportData(
    collectionName: string,
    docs: any[],
    onProgress: (p: number, m: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `${sanitizeFilename(collectionName)}_${timestamp}.json`

    // Preflight estimate (sample first 200 docs)
    const sample = docs.slice(0, 200).map(d => JSON.stringify(d))
    const avgSize = sample.length
      ? sample.reduce((a, s) => a + s.length, 0) / sample.length
      : 0
    const estimatedBytes = Math.round(avgSize * docs.length)
    const estimatedMB = Math.round(estimatedBytes / 1024 / 1024)
    onProgress(0.02, `Estimated size ~${estimatedMB} MB`)

    const writer = new ByteAssembler()
    writer.beginArray()

    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      if (signal.aborted) {
        throw new DOMException('AbortError: Export aborted', 'AbortError')
      }

      const batch = docs.slice(i, i + CHUNK_SIZE)
      for (let j = 0; j < batch.length; j++) {
        const idx = i + j
        const json = JSON.stringify(batch[j])
        writer.item(json, idx === docs.length - 1)

        // Report progress every 10 docs for smoother updates on small collections
        if (idx % 10 === 0 || idx === docs.length - 1) {
          const progress = Math.min(0.95, (idx + 1) / docs.length)
          onProgress(progress, `Processing ${idx + 1} / ${docs.length}`)
        }
      }

      await sleep0()
    }

    writer.endArray()
    onProgress(0.98, 'Finalizing…')

    const blob = writer.toBlob()
    await saveBlob(blob, name, signal, p =>
      onProgress(0.95 + 0.04 * p, 'Downloading…'),
    )
  },

  /**
   * Legacy: Export inferred JSON Schema (draft 2020-12)
   * @deprecated Use exportCollection with JSON_SCHEMA format
   */
  async exportSchema(
    collectionName: string,
    docs: any[],
    onProgress: (p: number, m: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    // Use new MongoExportFormats
    const format = ALL_FORMATS.find(f => f.key === 'json-schema')
    if (!format) {
      throw new Error(
        'Export format "json-schema" not found. This is a bug in the export system.',
      )
    }
    await this.exportCollection(
      format,
      collectionName,
      docs,
      onProgress,
      signal,
      { pretty: true },
    )
  },
}
