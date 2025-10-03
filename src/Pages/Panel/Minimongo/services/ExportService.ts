/**
 * ExportService: Core export logic for Minimongo collections
 *
 * Provides:
 * - Data export with memory-efficient byte assembly
 * - JSON Schema inference (draft 2020-12)
 * - Port-based relay downloads for cross-context blob transfer
 */

import { ByteAssembler } from './ByteAssembler'
import { sanitizeFilename } from '@/Utils/Filename'
import { flags } from '@/Config/flags'
import { RelayClient } from './RelayClient'

const CHUNK_SIZE = 500

function sleep0(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function inDevToolsPanel(): boolean {
  // devtools pages use a chrome-extension:// URL but include "devtools" resources
  return location.href.startsWith('chrome-extension://') && /devtools/i.test(document.referrer + ' ' + location.href)
}

async function tryAnchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  } finally { URL.revokeObjectURL(url) }
}

async function downloadViaRelay(blob: Blob, filename: string, mime: string, signal: AbortSignal, onProgress:(p:number)=>void) {
  // Compute checksum for integrity verification
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const { sha256Hex } = await import('@/Utils/Hash')
  const expectedHash = await sha256Hex(bytes)
  console.log('[Export] Blob hash:', expectedHash, 'size:', bytes.byteLength, 'first 4 bytes:', Array.from(bytes.slice(0, 4)))

  const relay = new RelayClient()
  await relay.sendBlob(blob, filename, mime, expectedHash, signal, onProgress)
}

export async function saveBlob(blob: Blob, filename: string, signal: AbortSignal, onProgress:(p:number)=>void) {
  const mime = blob.type || 'application/octet-stream'
  const inPanel = inDevToolsPanel()
  const forceRelay = flags.export.useBackgroundRelay
  console.log('[Export] saveBlob:', {
    filename,
    blobSize: blob.size,
    mime,
    inPanel,
    forceRelay,
    willUseRelay: forceRelay || inPanel
  })
  const mustRelay = forceRelay || inPanel
  if (mustRelay) return downloadViaRelay(blob, filename, mime, signal, onProgress)
  return tryAnchorDownload(blob, filename)
}

export const ExportService = {
  /**
   * Export collection data as JSON array
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
      }

      const progress = Math.min(0.95, (i + batch.length) / docs.length)
      onProgress(progress, `Processing ${i + batch.length} / ${docs.length}`)
      await sleep0()
    }

    writer.endArray()
    onProgress(0.98, 'Finalizing…')

    const blob = writer.toBlob()
    await saveBlob(blob, name, signal, (p) => onProgress(0.95 + 0.04 * p, 'Downloading…'))
  },

  /**
   * Export inferred JSON Schema (draft 2020-12)
   */
  async exportSchema(
    collectionName: string,
    docs: any[],
    onProgress: (p: number, m: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const schema = inferSchema(docs, onProgress, signal)
    const json = JSON.stringify(schema, null, 2)
    const blob = new Blob([json], { type: 'application/json' })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `${sanitizeFilename(collectionName)}_${timestamp}.schema.json`

    await saveBlob(blob, name, signal, (p) => onProgress(0.95 + 0.04 * p, 'Downloading schema…'))
  },
}

// --- Schema Inference (v1) ---

type J = any

function unifyTypes(types: Set<string>): J {
  const arr = Array.from(types).sort()
  if (arr.length === 0) return {}
  if (arr.length === 1) return { type: arr[0] }
  if (arr.length > 3) return {} // Too many types, collapse
  return { anyOf: arr.map(t => ({ type: t })) }
}

function typeOf(v: any): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  return t === 'object' ? 'object' : t // number | string | boolean | object
}

function hashShapeKeys(obj: Record<string, J>): string {
  return Object.keys(obj).sort().join('\n')
}

function inferArray(
  items: any[],
  depth: number,
  onProgress: Function,
  signal: AbortSignal,
): J {
  const elemTypes = new Set<string>()
  const objectShapes = new Map<string, J>()

  for (const el of items) {
    if (signal.aborted) throw new DOMException('AbortError', 'AbortError')
    const t = typeOf(el)

    if (t === 'object') {
      const s = inferObject(el, depth + 1, onProgress, signal)
      const key = hashShapeKeys(s.properties || {})
      if (!objectShapes.has(key)) objectShapes.set(key, s)
      if (objectShapes.size > 5) return { type: 'array' } // Too many variants, collapse
    } else if (t === 'array') {
      // Nested arrays collapse in v1
      return { type: 'array' }
    } else {
      elemTypes.add(t)
      if (elemTypes.size > 3) return {}
    }
  }

  if (objectShapes.size > 0) {
    return {
      type: 'array',
      items: { anyOf: Array.from(objectShapes.values()) },
    }
  }

  const base = unifyTypes(elemTypes)
  return Object.keys(base).length ? { type: 'array', items: base } : { type: 'array' }
}

function inferObject(
  obj: Record<string, J>,
  depth: number,
  onProgress: Function,
  signal: AbortSignal,
): J {
  if (depth > 5) return {} // Depth cap

  const props: Record<string, J> = {}
  const required: string[] = []

  const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  for (const [k, v] of entries) {
    if (signal.aborted) throw new DOMException('AbortError', 'AbortError')

    const t = typeOf(v)
    if (t === 'object') {
      props[k] = inferObject(v as any, depth + 1, onProgress, signal)
    } else if (t === 'array') {
      props[k] = inferArray(v as any[], depth + 1, onProgress, signal)
    } else {
      props[k] = { type: t }
    }

    // Track this key as present in this document
    required.push(k)
  }

  return {
    type: 'object',
    additionalProperties: true,
    properties: props,
    required,
  }
}

function mergeObjectSchemas(s1: J, s2: J): J {
  const out: J = {
    type: 'object',
    additionalProperties: true,
    properties: {},
    required: [],
  }

  const p1 = (s1.properties || {}) as Record<string, J>
  const p2 = (s2.properties || {}) as Record<string, J>
  const keys = Array.from(new Set([...Object.keys(p1), ...Object.keys(p2)])).sort()

  out.properties = {}
  for (const k of keys) {
    const a = p1[k]
    const b = p2[k]
    if (!a) out.properties[k] = b
    else if (!b) out.properties[k] = a
    else out.properties[k] = mergeSchemas(a, b)
  }

  // A field is required only if it's present in both schemas' required arrays
  const req1 = new Set(s1.required || [])
  const req2 = new Set(s2.required || [])
  out.required = keys.filter(k => req1.has(k) && req2.has(k)).sort()

  return out
}

function mergeSchemas(a: J, b: J): J {
  if (!a) return b
  if (!b) return a

  if (a.type === 'object' && b.type === 'object') {
    return mergeObjectSchemas(a, b)
  }
  if (a.type === 'array' && b.type === 'array') {
    return { type: 'array', items: mergeSchemas(a.items, b.items) }
  }

  const types = new Set<string>()
  const add = (x: J) => {
    if (x?.type) types.add(x.type)
    else if (x?.anyOf) x.anyOf.forEach((n: any) => n?.type && types.add(n.type))
  }
  add(a)
  add(b)
  return unifyTypes(types)
}

export function inferSchema(
  docs: any[],
  onProgress: (p: number, m: string) => void,
  signal: AbortSignal,
): J {
  const header = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: true,
  }

  if (docs.length === 0) {
    return { ...header, type: 'array', items: {} }
  }

  let merged: J | null = null
  const presence = new Map<string, number>()

  for (let i = 0; i < docs.length; i++) {
    if (signal.aborted) throw new DOMException('AbortError', 'AbortError')

    const doc = docs[i]
    const s = inferObject(doc, 0, onProgress, signal)
    merged = merged ? mergeObjectSchemas(merged, s) : s

    for (const k of Object.keys(doc)) {
      presence.set(k, (presence.get(k) || 0) + 1)
    }

    if (i % 200 === 0) {
      onProgress(Math.min(0.95, i / docs.length), `Inferring ${i}/${docs.length}`)
    }
  }

  // Field is required if present in every document
  const req: string[] = []
  const total = docs.length
  for (const [k, n] of Array.from(presence.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (n === total) req.push(k)
  }

  return {
    ...header,
    type: 'object',
    additionalProperties: true,
    properties: merged?.properties || {},
    required: req,
  }
}
